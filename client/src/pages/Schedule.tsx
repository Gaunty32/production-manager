import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, addDays, startOfDay } from "date-fns";
import { MACHINE_NAMES } from "@shared/machines";
import { cn } from "@/lib/utils";
import type { JobSchedule, Staff, Job } from "@shared/schema";

const MACHINES = [1, 2, 3, 4];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function Schedule() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedStaff, setSelectedStaff] = useState<string | "all">("all");

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: schedules = [] } = useQuery<JobSchedule[]>({
    queryKey: [`/api/job-schedules?date=${format(selectedDate, 'yyyy-MM-dd')}`],
  });

  const filteredSchedules = selectedStaff === "all" 
    ? schedules 
    : schedules.filter(s => s.staffId === selectedStaff);

  const getSchedulesForMachine = (machineId: number) => {
    return filteredSchedules.filter(s => s.machineId === machineId);
  };

  const getJobDetails = (jobId: string) => {
    return jobs.find(j => j.id === jobId);
  };

  const getStaffName = (staffId: string | null) => {
    if (!staffId) return "Unassigned";
    const staffMember = staff.find(s => s.id === staffId);
    return staffMember?.name || "Unknown";
  };

  const timeToPosition = (timeMinutes: number) => {
    return (timeMinutes / (24 * 60)) * 100;
  };

  const durationToWidth = (durationMinutes: number) => {
    return (durationMinutes / (24 * 60)) * 100;
  };

  const previousDay = () => {
    setSelectedDate(addDays(selectedDate, -1));
  };

  const nextDay = () => {
    setSelectedDate(addDays(selectedDate, 1));
  };

  const today = () => {
    setSelectedDate(startOfDay(new Date()));
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b p-4 bg-card">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Job Schedule</h1>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={previousDay}
                data-testid="button-previous-day"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                onClick={today}
                data-testid="button-today"
                className="min-w-20"
              >
                Today
              </Button>
              
              <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-background" data-testid="text-selected-date">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{format(selectedDate, 'EEE, MMM d, yyyy')}</span>
              </div>
              
              <Button
                variant="outline"
                size="icon"
                onClick={nextDay}
                data-testid="button-next-day"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-48" data-testid="select-staff-filter">
                <SelectValue placeholder="Filter by staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <Card className="p-4">
          <div className="space-y-1">
            <div className="flex gap-2">
              <div className="w-32 shrink-0" />
              <div className="flex-1 relative">
                <div className="flex h-8 border-b">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="flex-1 text-xs text-muted-foreground text-center border-l first:border-l-0"
                    >
                      {hour.toString().padStart(2, '0')}:00
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {MACHINES.map((machineId) => {
              const machineSchedules = getSchedulesForMachine(machineId);
              
              return (
                <div key={machineId} className="flex gap-2 border-b last:border-b-0 py-2">
                  <div className="w-32 shrink-0 flex items-center">
                    <div className="font-medium" data-testid={`text-machine-${machineId}`}>
                      {MACHINE_NAMES[machineId]}
                    </div>
                  </div>
                  
                  <div className="flex-1 relative h-16 bg-muted/20 rounded">
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="absolute top-0 bottom-0 border-l border-muted"
                        style={{ left: `${(hour / 24) * 100}%` }}
                      />
                    ))}
                    
                    {machineSchedules.map((schedule) => {
                      const job = getJobDetails(schedule.jobId);
                      const staffName = getStaffName(schedule.staffId);
                      const left = timeToPosition(schedule.startTime);
                      const width = durationToWidth(schedule.endTime - schedule.startTime);
                      
                      return (
                        <div
                          key={schedule.id}
                          className={cn(
                            "absolute top-1 bottom-1 rounded px-2 py-1 text-xs overflow-hidden",
                            "bg-primary text-primary-foreground hover-elevate cursor-pointer",
                            schedule.status === 'completed' && "bg-green-600 dark:bg-green-700",
                            schedule.status === 'in_progress' && "bg-blue-600 dark:bg-blue-700",
                            schedule.status === 'cancelled' && "bg-gray-400 dark:bg-gray-600"
                          )}
                          style={{ 
                            left: `${left}%`, 
                            width: `${width}%`,
                            minWidth: '60px'
                          }}
                          data-testid={`schedule-${schedule.id}`}
                        >
                          <div className="font-medium truncate">
                            {job?.jobName || 'Unknown Job'}
                          </div>
                          <div className="text-[10px] opacity-90 truncate">
                            {staffName}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredSchedules.length === 0 && (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-schedules">
              <p>No jobs scheduled for this day</p>
              <p className="text-sm mt-1">Create a schedule to see it here</p>
            </div>
          )}
        </Card>

        <div className="mt-4 flex gap-4">
          <Card className="p-4 flex-1">
            <h3 className="font-semibold mb-3">Legend</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-primary" />
                <span>Scheduled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-600" />
                <span>In Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-600" />
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-400" />
                <span>Cancelled</span>
              </div>
            </div>
          </Card>

          <Card className="p-4 flex-1">
            <h3 className="font-semibold mb-3">Schedule Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Schedules:</span>
                <span className="font-medium">{filteredSchedules.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed:</span>
                <span className="font-medium text-green-600">
                  {filteredSchedules.filter(s => s.status === 'completed').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">In Progress:</span>
                <span className="font-medium text-blue-600">
                  {filteredSchedules.filter(s => s.status === 'in_progress').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scheduled:</span>
                <span className="font-medium">
                  {filteredSchedules.filter(s => s.status === 'scheduled').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cancelled:</span>
                <span className="font-medium text-gray-500">
                  {filteredSchedules.filter(s => s.status === 'cancelled').length}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
