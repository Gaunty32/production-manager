import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MACHINE_NAMES } from "@shared/machines";
import { format } from "date-fns";
import type { JobSchedule, StaffShift, MachineScheduleBlock } from "@shared/schema";
import { Clock } from "lucide-react";

interface AvailabilitySummaryProps {
  selectedDate: Date;
}

export function AvailabilitySummary({ selectedDate }: AvailabilitySummaryProps) {
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  
  const { data: schedules = [] } = useQuery<JobSchedule[]>({
    queryKey: [`/api/job-schedules?date=${dateStr}`],
  });

  const { data: shifts = [] } = useQuery<StaffShift[]>({
    queryKey: [`/api/staff-shifts?date=${dateStr}`],
  });

  const { data: blocks = [] } = useQuery<MachineScheduleBlock[]>({
    queryKey: [`/api/machine-schedule-blocks?date=${dateStr}`],
  });

  const calculateMachineAvailability = (machineId: number) => {
    const machineSchedules = schedules.filter(s => s.machineId === machineId);
    const machineBlocks = blocks.filter(b => b.machineId === machineId);
    
    const totalBlocked = [...machineSchedules, ...machineBlocks].reduce((acc, item) => {
      return acc + (item.endTime - item.startTime);
    }, 0);
    
    const totalMinutes = 24 * 60; // Full day
    const availableMinutes = totalMinutes - totalBlocked;
    const utilizationPercent = Math.round((totalBlocked / totalMinutes) * 100);
    
    return {
      available: availableMinutes,
      utilized: totalBlocked,
      utilizationPercent,
    };
  };

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const machines = [1, 2, 3, 4, 5];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Machine Availability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {machines.map((machineId) => {
          const availability = calculateMachineAvailability(machineId);
          const isHighlyUtilized = availability.utilizationPercent > 80;
          const isMediumUtilized = availability.utilizationPercent > 50 && availability.utilizationPercent <= 80;
          
          return (
            <div key={machineId} className="space-y-1" data-testid={`availability-machine-${machineId}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{MACHINE_NAMES[machineId]}</span>
                <Badge 
                  variant={isHighlyUtilized ? "destructive" : isMediumUtilized ? "secondary" : "default"}
                  className="text-xs"
                >
                  {availability.utilizationPercent}% used
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Available: {formatMinutes(availability.available)}</span>
                <span>Used: {formatMinutes(availability.utilized)}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    isHighlyUtilized ? 'bg-destructive' : 
                    isMediumUtilized ? 'bg-primary' : 
                    'bg-green-500'
                  }`}
                  style={{ width: `${availability.utilizationPercent}%` }}
                />
              </div>
            </div>
          );
        })}
        
        <div className="pt-3 border-t" data-testid="staff-shifts-count">
          <p className="text-xs font-medium text-muted-foreground mb-2">Staff Shifts Today</p>
          <p className="text-sm">{shifts.length} shift{shifts.length !== 1 ? 's' : ''} scheduled</p>
        </div>
        
        <div className="pt-3 border-t" data-testid="maintenance-blocks-count">
          <p className="text-xs font-medium text-muted-foreground mb-2">Maintenance Blocks</p>
          <p className="text-sm">{blocks.length} block{blocks.length !== 1 ? 's' : ''} scheduled</p>
        </div>
      </CardContent>
    </Card>
  );
}
