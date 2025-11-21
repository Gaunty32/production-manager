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

export function suggestMachine(quantity: number, jobType: string, stitchCount?: number): number | null {
  if (jobType !== "Embroidery" && jobType !== "Embroidery Initials/Name") {
    return null;
  }
  
  if (quantity <= 0) {
    return null;
  }
  
  // If stitch count is provided, use production time-based selection for better efficiency
  if (stitchCount && stitchCount > 0) {
    // Calculate production time for each candidate machine
    const candidates = [
      { machineId: 1, metrics: calculateProductionMetrics(quantity, stitchCount, 1) }, // Barudan 8
      { machineId: 2, metrics: calculateProductionMetrics(quantity, stitchCount, 2) }, // Barudan 6 1
      { machineId: 3, metrics: calculateProductionMetrics(quantity, stitchCount, 3) }, // SWF 6 1
    ];
    
    // Find machine with shortest production time
    let bestMachine = candidates[0];
    for (const candidate of candidates) {
      if (candidate.metrics && (!bestMachine.metrics || candidate.metrics.totalTimeMinutes < bestMachine.metrics.totalTimeMinutes)) {
        bestMachine = candidate;
      }
    }
    
    return bestMachine.machineId;
  }
  
  // Fallback to quantity-based thresholds if no stitch count provided
  if (quantity > 75) {
    return 1; // Barudan 8
  } else if (quantity >= 26 && quantity <= 75) {
    return 3; // SWF 6 1
  } else {
    return 2; // Barudan 6 1
  }
}
