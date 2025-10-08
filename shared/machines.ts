export const MACHINE_NAMES: Record<number, string> = {
  1: "Velocity",
  2: "Momentum",
  3: "Apex",
  4: "Surge",
  5: "Pinnacle",
};

export function getMachineName(machineId: number | null): string {
  if (machineId === null) return "Unassigned";
  return MACHINE_NAMES[machineId] || `Machine ${machineId}`;
}
