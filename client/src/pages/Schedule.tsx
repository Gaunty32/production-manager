import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, addDays, startOfDay } from "date-fns";
import { MACHINE_NAMES } from "@shared/machines";
import { cn } from "@/lib/utils";
import { ShiftsManagement } from "@/components/ShiftsManagement";
import { MachineBlocksManagement } from "@/components/MachineBlocksManagement";
import { StaffMachineAllocations } from "@/components/StaffMachineAllocations";
import { JobScheduleDialog } from "@/components/JobScheduleDialog";
import { UnscheduledJobs } from "@/components/UnscheduledJobs";
import { AvailabilitySummary } from "@/components/AvailabilitySummary";
import type { JobSchedule, Staff, Job } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const MACHINES = [1, 2, 3, 4, 5];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function Schedule() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedStaff, setSelectedStaff] = useState<string | "all">("all");
  const [selectedMachine, setSelectedMachine] = useState<number | "all">("all");
  const [selectedStatus, setSelectedStatus] = useState<string | "all">("all");

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: schedules = [] } = useQuery<JobSchedule[]>({
    queryKey: ['/api/job-schedules', { date: format(selectedDate, 'yyyy-MM-dd') }],
    queryFn: async () => {
      const response = await fetch(`/api/job-schedules?date=${format(selectedDate, 'yyyy-MM-dd')}`);
      if (!response.ok) throw new Error('Failed to fetch schedules');
      return response.json();
    },
  });

  const autoScheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/scheduling/auto-schedule', {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/job-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      
      const description = data.scheduledCount > 0 
        ? `Successfully scheduled ${data.scheduledCount} job${data.scheduledCount !== 1 ? 's' : ''}. ${data.failedCount > 0 ? `${data.failedCount} could not be scheduled.` : ''}`
        : data.message || `${data.failedCount} jobs could not be scheduled.`;
      
      toast({
        title: "Auto-scheduling complete",
        description,
      });
      
      if (data.failed && data.failed.length > 0) {
        console.log("Failed to schedule:", data.failed);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Auto-scheduling failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  let filteredSchedules = schedules;
  
  if (selectedStaff !== "all") {
    filteredSchedules = filteredSchedules.filter(s => s.staffId === selectedStaff);
  }
  
  if (selectedMachine !== "all") {
    filteredSchedules = filteredSchedules.filter(s => s.machineId === selectedMachine);
  }
  
  if (selectedStatus !== "all") {
    filteredSchedules = filteredSchedules.filter(s => s.status === selectedStatus);
  }

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
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="shrink-0 border-b px-4 pt-4 pb-2 bg-card">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Schedule Management</h1>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <Tabs defaultValue="timeline" className="w-full">
          <TabsList data-testid="tabs-schedule">
            <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline</TabsTrigger>
            <TabsTrigger value="shifts" data-testid="tab-shifts">Staff Shifts</TabsTrigger>
            <TabsTrigger value="blocks" data-testid="tab-blocks">Machine Blocks</TabsTrigger>
            <TabsTrigger value="allocations" data-testid="tab-allocations">Staff Allocations</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <div className="flex items-center gap-3 flex-wrap mb-4">
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

            <Select 
              value={selectedMachine === "all" ? "all" : selectedMachine.toString()} 
              onValueChange={(value) => setSelectedMachine(value === "all" ? "all" : parseInt(value))}
            >
              <SelectTrigger className="w-48" data-testid="select-machine-filter">
                <SelectValue placeholder="Filter by machine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Machines</SelectItem>
                {Object.entries(MACHINE_NAMES).map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-48" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <JobScheduleDialog 
              preselectedDate={format(selectedDate, 'yyyy-MM-dd')}
            />

            <Button
              onClick={() => autoScheduleMutation.mutate()}
              disabled={autoScheduleMutation.isPending}
              variant="default"
              className="gap-2"
              data-testid="button-auto-schedule"
            >
              <Zap className="h-4 w-4" />
              {autoScheduleMutation.isPending ? "Scheduling..." : "Auto-Schedule All"}
            </Button>
          </div>

          <div className="flex gap-4">
          <div className="flex-1">
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

            {MACHINES.filter(machineId => 
              selectedMachine === "all" || machineId === selectedMachine
            ).map((machineId) => {
              const machineSchedules = getSchedulesForMachine(machineId);
              
              return (
                <div key={machineId} className="flex gap-2 border-b last:border-b-0 py-2">
                  <div className="w-32 shrink-0 flex items-center">
                    <div className="font-medium" data-testid={`text-machine-${machineId}`}>
                      {MACHINE_NAMES[machineId]}
                    </div>
                  </div>
                  
                  <div className="flex-1 relative h-16 bg-muted/20 rounded overflow-hidden">
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
          
          <div className="w-80 shrink-0 space-y-4">
            <AvailabilitySummary selectedDate={selectedDate} />
            <UnscheduledJobs />
          </div>
          </div>
          </TabsContent>

          <TabsContent value="shifts" className="mt-4">
            <ShiftsManagement />
          </TabsContent>

          <TabsContent value="blocks" className="mt-4">
            <MachineBlocksManagement />
          </TabsContent>

          <TabsContent value="allocations" className="mt-4">
            <StaffMachineAllocations />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
