import { desc, eq, like } from "drizzle-orm";
import { db } from "./db";
import { appSettings } from "@shared/schema";
import type { FacebookArticleRecord } from "@shared/facebookArticleSharing";
import { newFacebookSharingState, type FacebookSharingState, type FacebookSharingStore } from "./facebookArticleDelivery";

/** Existing app_settings provides durable history without any schema migration. */
export function facebookArticleStore(pageId: string): FacebookSharingStore & { retryHeld(key: string): Promise<void> } {
  if (!/^\d+$/.test(pageId)) throw new Error("Configure the Facebook Page ID before using article sharing.");
  const stateKey = `facebook-articles:${pageId}:config`;
  const prefix = `facebook-articles:${pageId}:post:`;
  const readState = (value?: string) => ({ ...newFacebookSharingState(), ...(value ? JSON.parse(value) : {}) }) as FacebookSharingState;
  const writeRecord = (record: FacebookArticleRecord, owner: string, claim: boolean) => db.transaction(async tx => {
    if (!/^[a-f0-9]{64}$/.test(record.key)) throw new Error("Invalid article key.");
    const [config] = await tx.select().from(appSettings).where(eq(appSettings.key, stateKey)).for("update");
    if (!config || readState(config.value).owner !== owner) throw new Error("Another instance has taken over the Facebook check.");
    const state = readState(config.value);
    if (claim && (!state.enabled || !state.soroSharingStopped)) return false;
    const key = `${prefix}${record.key}`;
    if (claim) {
      const [previous] = await tx.select().from(appSettings).where(eq(appSettings.key, key));
      if (previous && ["published", "already_shared", "publishing", "review", "rejected"].includes(JSON.parse(previous.value).status)) return false;
    }
    const value = JSON.stringify(record);
    await tx.insert(appSettings).values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
    return true;
  });
  return {
    async read() {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, stateKey));
      return readState(row?.value);
    },
    async mutate(change) {
      return db.transaction(async tx => {
        await tx.insert(appSettings).values({ key: stateKey, value: JSON.stringify(newFacebookSharingState()) }).onConflictDoNothing();
        const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, stateKey)).for("update");
        const state = readState(row.value);
        const result = change(state);
        await tx.update(appSettings).set({ value: JSON.stringify(state), updatedAt: new Date() }).where(eq(appSettings.key, stateKey));
        return result;
      });
    },
    async record(key) {
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid article key.");
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, `${prefix}${key}`));
      return row ? JSON.parse(row.value) as FacebookArticleRecord : null;
    },
    async saveRecord(record, owner) { await writeRecord(record, owner, false); },
    async claimRecord(record, owner) { return writeRecord(record, owner, true); },
    async records() {
      const rows = await db.select().from(appSettings).where(like(appSettings.key, `${prefix}%`))
        .orderBy(desc(appSettings.updatedAt)).limit(30);
      return rows.map(row => JSON.parse(row.value) as FacebookArticleRecord);
    },
    async retryHeld(key) {
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid article key.");
      await db.transaction(async tx => {
        await tx.insert(appSettings).values({ key: stateKey, value: JSON.stringify(newFacebookSharingState()) }).onConflictDoNothing();
        const [config] = await tx.select().from(appSettings).where(eq(appSettings.key, stateKey)).for("update");
        const state = readState(config.value);
        if (state.owner && (state.leaseUntil || 0) > Date.now()) throw new Error("A Facebook check is running. Wait for it to finish before authorising a retry.");
        const recordKey = `${prefix}${key}`;
        const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, recordKey)).for("update");
        const record: FacebookArticleRecord | null = row ? JSON.parse(row.value) : null;
        if (!record || !["review", "rejected"].includes(record.status)) throw new Error("Only held or rejected publications can be authorised for retry.");
        await tx.update(appSettings).set({
          value: JSON.stringify({ ...record, status: "blocked", error: undefined, updatedAt: new Date().toISOString() }),
          updatedAt: new Date(),
        }).where(eq(appSettings.key, recordKey));
        delete state.owner;
        delete state.leaseUntil;
        state.lastScheduledDay = null;
        await tx.update(appSettings).set({ value: JSON.stringify(state), updatedAt: new Date() }).where(eq(appSettings.key, stateKey));
      });
    },
  };
}
