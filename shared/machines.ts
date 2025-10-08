export const MACHINE_NAMES: Record<number, string> = {
  1: "Velocity",
  2: "Momentum",
  3: "Apex",
  4: "Surge",
  5: "Pinnacle",
};

export const MACHINE_HEADS: Record<number, number> = {
  1: 8,  // Velocity - Best machine with 8 heads
  2: 6,  // Momentum - Second tier with 6 heads
  3: 6,  // Apex - Second tier with 6 heads
  4: 6,  // Surge - Third tier with 6 heads
  5: 6,  // Pinnacle - Third tier with 6 heads
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
  if (!machineId || !stitchCount || !quantity) {
    return null;
  }

  const heads = getMachineHeads(machineId);
  const runs = Math.ceil(quantity / heads);
  const embroideryTimePerRun = stitchCount / STITCHES_PER_MINUTE;
  const timePerRunMinutes = embroideryTimePerRun + CHANGEOVER_TIME_MINUTES;
  const totalTimeMinutes = runs * timePerRunMinutes;

  return {
    runs,
    timePerRunMinutes: Math.round(timePerRunMinutes * 10) / 10,
    totalTimeMinutes: Math.round(totalTimeMinutes * 10) / 10,
  };
}
