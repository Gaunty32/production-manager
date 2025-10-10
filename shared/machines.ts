export const MACHINE_NAMES: Record<number, string> = {
  1: "Barudan 8",
  2: "Barudan",
  3: "SWF",
  4: "SWF",
};

export const MACHINE_HEADS: Record<number, number> = {
  1: 8,  // Barudan 8 - Best machine with 8 heads
  2: 6,  // Barudan - 6 heads
  3: 6,  // SWF - 6 heads
  4: 6,  // SWF - 6 heads
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
  if (machineId === null || !stitchCount || !quantity) {
    return null;
  }

  const heads = getMachineHeads(machineId);
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
