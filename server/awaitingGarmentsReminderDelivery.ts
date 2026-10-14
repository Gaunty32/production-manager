import { randomUUID } from "node:crypto";
import type { AwaitingGarmentsEmail } from "./awaitingGarmentsReminderEmail";

export interface GarmentsPayload {
  email: AwaitingGarmentsEmail;
  rendered: { subject: string; html: string; text: string };
}
export interface GarmentsDeliveryState {
  status: "pending" | "sending" | "sent" | "skipped" | "failed" | "rejected" | "review";
  owner?: string;
  leaseUntil?: number;
  firstAttemptAt?: number;
  payload?: GarmentsPayload;
  providerId?: string;
  sentAt?: number;
  error?: string;
}
export interface GarmentsReminderStore {
  mutate<T>(key: string, update: (state: GarmentsDeliveryState) => { state: GarmentsDeliveryState; result: T }): Promise<T>;
}

/** Durable ownership and provider idempotency protect against restarts and parallel instances. */
export async function deliverAwaitingGarmentsReminder(
  store: GarmentsReminderStore, key: string,
  prepare: () => Promise<GarmentsPayload | null>,
  send: (payload: GarmentsPayload, key: string) => Promise<string>,
  clock = Date.now,
): Promise<GarmentsDeliveryState["status"] | "busy"> {
  const owner = randomUUID();
  const claim = await store.mutate(key, state => {
    if (["sent", "skipped", "rejected", "review"].includes(state.status)) return { state, result: state.status as GarmentsDeliveryState["status"] | "busy" };
    if (state.status === "sending" && (state.leaseUntil || 0) > clock()) return { state, result: "busy" as const };
    if (state.firstAttemptAt != null && clock() - state.firstAttemptAt >= 23 * 60 * 60 * 1000) {
      return { state: { ...state, status: "review" as const, error: "Delivery uncertain after provider idempotency window; review before retrying." }, result: "review" as const };
    }
    return { state: { ...state, status: "sending" as const, owner, leaseUntil: clock() + 10 * 60 * 1000 }, result: "sending" as const };
  });
  if (claim !== "sending") return claim;
  const finish = (status: GarmentsDeliveryState["status"], fields: Partial<GarmentsDeliveryState> = {}) =>
    store.mutate(key, state => state.owner !== owner
      ? { state, result: "busy" as const }
      : { state: { ...state, ...fields, status, owner: undefined, leaseUntil: undefined }, result: status });
  try {
    const fresh = await prepare();
    if (!fresh) return await finish("skipped");
    const payload = await store.mutate(key, state => {
      if (state.owner !== owner) return { state, result: null };
      if (state.payload && JSON.stringify(state.payload) !== JSON.stringify(fresh)) {
        return { state: { ...state, status: "review" as const, owner: undefined, leaseUntil: undefined, error: "Jobs or recipients changed during a delivery retry; review before resending." }, result: null };
      }
      return { state: { ...state, payload: state.payload || fresh }, result: state.payload || fresh };
    });
    if (!payload) return "review";
    const claimed = await store.mutate(key, state => ({
      state: state.owner === owner ? { ...state, firstAttemptAt: state.firstAttemptAt ?? clock(), leaseUntil: clock() + 10 * 60 * 1000 } : state,
      result: state.owner === owner,
    }));
    if (!claimed) return "busy";
    const providerId = await send(payload, key);
    if (!providerId) throw new Error("Email provider did not confirm delivery.");
    return await finish("sent", { providerId, sentAt: clock(), error: undefined });
  } catch (error: any) {
    return await finish(error?.permanent === true ? "rejected" : "failed", { error: error?.message || "Reminder delivery failed" });
  }
}
