import { useQuery } from "@tanstack/react-query";
import type { Machine } from "@shared/schema";

export function useMachines() {
  const { data: machines = [], isLoading } = useQuery<Machine[]>({
    queryKey: ["/api/machines"],
    staleTime: 30000,
  });

  const activeMachines = machines.filter(m => m.isActive);
  const allMachines = machines;

  return { machines: allMachines, activeMachines, isLoading };
}
