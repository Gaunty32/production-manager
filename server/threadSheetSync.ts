import { eq, sql } from "drizzle-orm";
import { appSettings } from "@shared/schema";
import {
  THREAD_SHEET_TABS, parseThreadSheetResponse, threadSheetSyncDue,
  type ThreadSheetColours,
} from "../shared/thread-sheet";
import { db } from "./db";
import { googleApiJson } from "./googleService";

const SHEET_ID = "1mxsnnNoe-DwJGwlGh980x19euie-c-Ek0ug3pGBw3vs";
const STATE_KEY = "thread_sheet_snapshot";
const RETRY_DELAY_MS = 5 * 60_000;

type Snapshot = {
  colours: ThreadSheetColours | null;
  syncedAt: string | null;
  attemptedAt: string | null;
  lastError: string | null;
};

let pending: Promise<Snapshot> | null = null;

async function readSheet(): Promise<ThreadSheetColours> {
  // One batch read covers all three tabs, through the shared throttled/retry client.
  const query = new URLSearchParams();
  for (const tab of THREAD_SHEET_TABS) query.append("ranges", `'${tab}'!A1:A1000`);
  const data = await googleApiJson(
    "google-sheet", `/v4/spreadsheets/${SHEET_ID}/values:batchGet?${query}`,
    { method: "GET" },
  );
  return parseThreadSheetResponse(data);
}

async function syncIfDue(force: boolean): Promise<Snapshot> {
  return db.transaction(async tx => {
    // A transaction-scoped advisory lock also covers the first sync when no row exists.
    const lock = await tx.execute(sql`
      SELECT pg_try_advisory_xact_lock(hashtext('thread-sheet-daily-sync')) AS acquired
    `);
    const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, STATE_KEY));
    const state: Snapshot = row ? JSON.parse(row.value) : {
      colours: null, syncedAt: null, attemptedAt: null, lastError: null,
    };
    if (!lock.rows[0]?.acquired) {
      if (force) throw new Error("Another instance is syncing the thread list; please try again shortly");
      return state;
    }

    const now = new Date();
    if (!force && !threadSheetSyncDue(state.syncedAt, now)) return state;
    if (!force && state.attemptedAt && now.getTime() - Date.parse(state.attemptedAt) < RETRY_DELAY_MS) {
      return state;
    }
    state.attemptedAt = now.toISOString();
    try {
      const colours = await readSheet();
      // Replace atomically only after all tabs succeed, including valid empty tabs.
      state.colours = colours;
      state.syncedAt = new Date().toISOString();
      state.lastError = null;
      console.log(`[ThreadSheet] Synced all three tabs (${Object.values(colours).reduce((n, codes) => n + codes.length, 0)} codes)`);
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : "Google Sheet sync failed";
      console.error("[ThreadSheet] Sync failed; retaining last successful list:", state.lastError);
    }
    await tx.insert(appSettings).values({ key: STATE_KEY, value: JSON.stringify(state) })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: JSON.stringify(state), updatedAt: new Date() },
      });
    return state;
  });
}

export async function getThreadSheetSnapshot(force = false) {
  // A manual refresh must not silently share a routine cache-only read.
  if (force && pending) await pending;
  if (!pending) {
    pending = syncIfDue(force).finally(() => { pending = null; });
  }
  const snapshot = await pending;
  if (!snapshot.colours || (force && snapshot.lastError)) {
    throw new Error(snapshot.lastError || "Thread list is being synced; please try again shortly");
  }
  return { ...snapshot, colours: snapshot.colours };
}

export function scheduleThreadSheetSync() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[ThreadSheet] Development — daily scheduler disabled; page requests initialise the list.");
    return;
  }
  const tick = () => getThreadSheetSnapshot().catch(error =>
    console.error("[ThreadSheet] Scheduled sync:", error.message),
  );
  setTimeout(tick, 10_000);
  setInterval(tick, 60_000);
  console.log("[ThreadSheet] Daily sync due 08:00 Europe/London; catches up when app is awake.");
}
