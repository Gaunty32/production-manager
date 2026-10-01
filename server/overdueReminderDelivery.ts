import { randomUUID } from "node:crypto";
import type { OverdueReminderEmail } from "./emailService";

export interface ReminderPayload {
  email: OverdueReminderEmail;
  rendered: { subject: string; html: string; text: string };
}

export interface ReminderState {
  status: "pending" | "sending" | "failed" | "sent" | "skipped" | "rejected" | "review";
  owner?: string;
  leaseUntil?: number;
  firstAttemptAt?: number;
  attempts?: number;
  payload?: ReminderPayload;
  providerId?: string;
  sentAt?: number;
  error?: string;
}

export interface ReminderStore {
  mutate<T>(
    key: string,
    update: (current: ReminderState | null) => { state: ReminderState; result: T },
  ): Promise<T>;
}

export type DeliveryOutcome = ReminderState["status"] | "busy";
const LEASE_MS = 10 * 60 * 1000;
// Resend retains keys for 24h. Leave a safety margin; don't blindly resend
// an old ambiguous acceptance after the provider's dedupe window has expired.
const SAFE_RETRY_MS = 23 * 60 * 60 * 1000;
const terminal = new Set(["sent", "skipped", "rejected", "review"]);

/** All network operations happen outside the short row-lock transaction. */
export async function deliverOverdueReminder(
  store: ReminderStore,
  key: string,
  prepare: () => Promise<ReminderPayload | null>,
  send: (payload: ReminderPayload, idempotencyKey: string) => Promise<string>,
  clock: () => number = Date.now,
): Promise<DeliveryOutcome> {
  const owner = randomUUID();
  const claim = await store.mutate(key, current => {
    const state: ReminderState = current || { status: "pending" };
    if (terminal.has(state.status)) return { state, result: state.status as DeliveryOutcome };
    if (state.status === "sending" && (state.leaseUntil || 0) > clock()) {
      return { state, result: "busy" as DeliveryOutcome };
    }
    if (state.firstAttemptAt != null && clock() - state.firstAttemptAt >= SAFE_RETRY_MS) {
      return {
        state: { ...state, status: "review", error: "Delivery uncertain after idempotency window; check Resend before retrying." },
        result: "review" as DeliveryOutcome,
      };
    }
    return {
      state: { ...state, status: "sending", owner, leaseUntil: clock() + LEASE_MS },
      result: "sending" as DeliveryOutcome,
    };
  });
  if (claim !== "sending") return claim;

  const finish = (status: ReminderState["status"], fields: Partial<ReminderState> = {}) =>
    store.mutate(key, current => {
      if (!current || current.owner !== owner) {
        return { state: current || { status: "pending" }, result: "busy" as DeliveryOutcome };
      }
      return {
        state: { ...current, ...fields, status, owner: undefined, leaseUntil: undefined },
        result: status as DeliveryOutcome,
      };
    });

  try {
    const saved = await store.mutate(key, current => ({
      state: current!,
      result: current?.owner === owner ? current.payload : undefined,
    }));
    // Re-check Xero before retrying: never remind about a balance now paid.
    const fresh = await prepare();
    if (!fresh) return await finish("skipped");
    if (saved) {
      const signature = (payload: ReminderPayload) => JSON.stringify({
        to: payload.email.to.slice().sort(),
        invoices: payload.email.invoices.slice().sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber)),
      });
      if (signature(saved) !== signature(fresh)) {
        return await finish("skipped", { error: "Balances or recipients changed; frozen retry cancelled." });
      }
    }
    const payload = saved || fresh;
    const canSend = await store.mutate(key, current => {
      if (!current || current.owner !== owner) {
        return { state: current || { status: "pending" }, result: false };
      }
      return {
        state: {
          ...current, payload, firstAttemptAt: current.firstAttemptAt ?? clock(),
          attempts: (current.attempts || 0) + 1, leaseUntil: clock() + LEASE_MS,
        },
        result: true,
      };
    });
    if (!canSend) return "busy";
    const providerId = await send(payload, key);
    if (!providerId) throw new Error("Email provider did not return a delivery ID.");
    return await finish("sent", { providerId, sentAt: clock(), error: undefined });
  } catch (error) {
    const permanent = !!(error && typeof error === "object" &&
      "permanent" in error && error.permanent === true);
    return await finish(permanent ? "rejected" : "failed", {
      error: error instanceof Error ? error.message : "Reminder delivery failed",
    });
  }
}