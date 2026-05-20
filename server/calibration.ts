import { db } from "./db";
import { machines, machineCalibrationHistory, jobLineItems } from "@shared/schema";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

export interface CalibrationResult {
  machineId: number;
  machineName: string;
  previousMultiplier: number;
  newMultiplier: number;
  observedRatio: number | null;
  sampleCount: number;
}

const WINDOW_DAYS = 14;
const MIN_SAMPLES = 3;

// In-process mutex to prevent overlapping recalibrations (manual + scheduled)
let recalibrationInFlight: Promise<CalibrationResult[]> | null = null;

function calcRawEstimateMinutes(quantity: number, stitchCount: number, heads: number, spm: number, changeover: number): number {
  if (!stitchCount || !quantity || !spm) return 0;
  const runs = Math.ceil(quantity / heads);
  const timePerRun = (stitchCount / spm) + changeover;
  return Math.ceil((runs * timePerRun) / 10) * 10;
}

/**
 * Recalibrates every active machine's scheduling multiplier based on
 * actual vs estimated production time for line items completed in the
 * last WINDOW_DAYS days (since each machine's calibrationStartedAt).
 *
 * Gentle adjustment: newMultiplier = (currentMultiplier + observedRatio) / 2
 */
export async function recalibrateMachines(trigger: "auto" | "manual" = "auto"): Promise<CalibrationResult[]> {
  if (recalibrationInFlight) {
    return recalibrationInFlight;
  }
  recalibrationInFlight = (async () => {
    try {
      return await runRecalibration(trigger);
    } finally {
      recalibrationInFlight = null;
    }
  })();
  return recalibrationInFlight;
}

async function runRecalibration(trigger: "auto" | "manual"): Promise<CalibrationResult[]> {
  const allMachines = await db.select().from(machines);
  const activeMachines = allMachines.filter(m => m.isActive);
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const results: CalibrationResult[] = [];

  for (const machine of activeMachines) {
    const effectiveStart = machine.calibrationStartedAt > windowStart ? machine.calibrationStartedAt : windowStart;

    const completedItems = await db
      .select()
      .from(jobLineItems)
      .where(
        and(
          eq(jobLineItems.machineId, machine.id),
          eq(jobLineItems.completed, true),
          isNotNull(jobLineItems.actualProductionTimeMinutes),
          isNotNull(jobLineItems.completedAt),
          gte(jobLineItems.completedAt, effectiveStart),
        )
      );

    let totalRatio = 0;
    let sampleCount = 0;

    for (const li of completedItems) {
      if (!li.stitchCount || li.stitchCount <= 0 || !li.quantity || li.quantity <= 0) continue;
      if (li.actualProductionTimeMinutes == null) continue;
      const raw = calcRawEstimateMinutes(
        li.quantity,
        li.stitchCount,
        machine.heads,
        machine.stitchesPerMinute,
        machine.changeoverTimeMinutes,
      );
      if (raw <= 0) continue;
      const ratio = li.actualProductionTimeMinutes / raw;
      if (ratio <= 0 || !isFinite(ratio)) continue;
      totalRatio += ratio;
      sampleCount++;
    }

    const previousMultiplier = machine.schedulingMultiplier ?? 1;
    let newMultiplier = previousMultiplier;
    let observedRatio: number | null = null;

    if (sampleCount >= MIN_SAMPLES) {
      observedRatio = totalRatio / sampleCount;
      // Gentle: move halfway from current multiplier toward observed ratio
      newMultiplier = (previousMultiplier + observedRatio) / 2;
      // Safety clamp
      if (newMultiplier < 0.5) newMultiplier = 0.5;
      if (newMultiplier > 3) newMultiplier = 3;
    }

    // Only mark as recalibrated when we actually had enough samples to adjust;
    // otherwise leave lastRecalibratedAt so the scheduler will retry on the next tick.
    const updateValues: Partial<typeof machines.$inferInsert> = {
      schedulingMultiplier: newMultiplier,
    };
    if (sampleCount >= MIN_SAMPLES) {
      updateValues.lastRecalibratedAt = windowEnd;
    }
    await db.update(machines).set(updateValues).where(eq(machines.id, machine.id));

    await db.insert(machineCalibrationHistory).values({
      machineId: machine.id,
      runAt: windowEnd,
      previousMultiplier,
      newMultiplier,
      observedRatio,
      sampleCount,
      windowStart: effectiveStart,
      windowEnd,
      trigger,
    });

    results.push({
      machineId: machine.id,
      machineName: machine.name,
      previousMultiplier,
      newMultiplier,
      observedRatio,
      sampleCount,
    });
  }

  return results;
}

/**
 * Scheduler: checks daily and runs recalibration if any active machine
 * has not been recalibrated in the last WINDOW_DAYS days.
 */
export function scheduleFortnightlyRecalibration() {
  const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
  const RECAL_INTERVAL_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const tick = async () => {
    try {
      const all = await db.select().from(machines).where(eq(machines.isActive, true));
      const now = Date.now();
      const needsRecal = all.some(m => !m.lastRecalibratedAt || (now - new Date(m.lastRecalibratedAt).getTime()) >= RECAL_INTERVAL_MS);
      if (!needsRecal) return;
      console.log("[Calibration] Running scheduled fortnightly recalibration...");
      const results = await recalibrateMachines("auto");
      console.log(`[Calibration] Done — ${results.length} machines updated`);
    } catch (err) {
      console.error("[Calibration] Scheduler error:", err);
    }
  };

  // Run once shortly after startup, then on interval
  setTimeout(tick, 60_000);
  setInterval(tick, CHECK_INTERVAL_MS);
}
