export const MACHINE_NAMES: Record<number, string> = {
  1: "Barudan 8",
  2: "Barudan 6 1",
  3: "SWF 6 1",
  4: "SWF 6 2",
  5: "Barudan 6 2",
};

export const MACHINE_HEADS: Record<number, number> = {
  1: 8,  // Barudan 8 - Best machine with 8 heads
  2: 6,  // Barudan 6 1 - 6 heads
  3: 6,  // SWF 6 1 - 6 heads
  4: 6,  // SWF 6 2 - 6 heads
  5: 6,  // Barudan 6 2 - 6 heads
};

export const STITCHES_PER_MINUTE = 750;
export const CHANGEOVER_TIME_MINUTES = 3;

export function getMachineName(machineId: number | null): string {
  if (machineId === null) return "Unassigned";
  return MACHINE_NAMES[machineId] || `Machine ${machineId}`;
}

export function getMachineHeads(machineId: number | null): number {
  if (machineId === null) return 0;
  return MACHINE_HEADS[machineId] || 6;
}

export interface ProductionMetrics {
  runs: number;
  timePerRunMinutes: number;
  totalTimeMinutes: number;
}

export function calculateProductionMetrics(
  quantity: number,
  stitchCount: number,
  machineId: number | null
): ProductionMetrics | null {
  if (!stitchCount || !quantity) {
    return null;
  }

  const heads = machineId !== null ? getMachineHeads(machineId) : 6;
  const runs = Math.ceil(quantity / heads);
  const embroideryTimePerRun = stitchCount / STITCHES_PER_MINUTE;
  const timePerRunMinutes = embroideryTimePerRun + CHANGEOVER_TIME_MINUTES;
  const totalTimeMinutes = runs * timePerRunMinutes;

  return {
    runs,
    timePerRunMinutes: Math.ceil(timePerRunMinutes),
    totalTimeMinutes: Math.ceil(totalTimeMinutes / 10) * 10,
  };
}

export function formatTimeDisplay(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}m`;
}

// Allocation rule (per line item):
//   quantity  > 40  -> Barudan 8 (id 1)
//   quantity <= 40  -> Barudan 6 1 (id 2) or Barudan 6 2 (id 5)
// SWF machines (ids 3, 4) are never auto-suggested. Staff can still pick them
// manually if they re-activate them.
export const BARUDAN_8_ID = 1;
export const BARUDAN_6_IDS = [2, 5];
export const LARGE_JOB_THRESHOLD = 40;

export function suggestMachine(quantity: number, jobType: string, stitchCount?: number): number | null {
  if (jobType !== "Embroidery" && jobType !== "Embroidery Initials/Name") {
    return null;
  }
  if (quantity <= 0) {
    return null;
  }
  if (quantity > LARGE_JOB_THRESHOLD) {
    return BARUDAN_8_ID;
  }
  // For ≤40, prefer the 6-head machine with the shortest estimated runtime
  // when a stitch count is provided; otherwise default to Barudan 6 1.
  if (stitchCount && stitchCount > 0) {
    let best: { machineId: number; minutes: number } | null = null;
    for (const id of BARUDAN_6_IDS) {
      const m = calculateProductionMetrics(quantity, stitchCount, id);
      if (m && (!best || m.totalTimeMinutes < best.minutes)) {
        best = { machineId: id, minutes: m.totalTimeMinutes };
      }
    }
    if (best) return best.machineId;
  }
  return BARUDAN_6_IDS[0];
}

export function getCandidateMachineIds(quantity: number): number[] {
  if (quantity <= 0) return [];
  if (quantity > LARGE_JOB_THRESHOLD) return [BARUDAN_8_ID];
  return [...BARUDAN_6_IDS];
}
