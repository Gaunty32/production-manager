import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus,
  CheckSquare,
  Clock,
  CheckCircle2,
  Trash2,
  Pencil,
  AlertCircle,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Link as LinkIcon,
  MessageSquare,
  User,
} from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import type { Task } from "@shared/schema";

type StaffUser = { id: string; username: string; name?: string; email: string; role: string };

const PRIORITY_CONFIG = {
  high: {
    label: "High",
    icon: ArrowUp,
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  medium: {
    label: "Medium",
    icon: ArrowRight,
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  low: {
    label: "Low",
    icon: ArrowDown,
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
};

const STATUS_CONFIG = {
  open: { label: "Open", icon: AlertCircle, class: "text-foreground" },
  in_progress: { label: "In Progress", icon: Clock, class: "text-amber-600 dark:text-amber-400" },
  completed: { label: "Done", icon: CheckCircle2, class: "text-green-600 dark:text-green-400" },
};

function initForm() {
  return {
    title: "",
    description: "",
    priority: "medium",
    status: "open",
    assignedToUserId: "",
    dueDate: "",
    jobId: "",
  };
}

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<"all" | "mine">("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState(initForm());

  const { data: allTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    refetchInterval: 10000,
  });

  const { data: staffUsers = [] } = useQuery<StaffUser[]>({
    queryKey: ["/api/users"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/tasks", {
        ...data,
        assignedToUserId: data.assignedToUserId || null,
        dueDate: data.dueDate || null,
        jobId: data.jobId || null,
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/count"] });
      toast({ title: "Task created" });
      closeDialog();
    },
    onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof form> }) =>
      apiRequest("PATCH", `/api/tasks/${id}`, {
        ...data,
        assignedToUserId: data.assignedToUserId || null,
        dueDate: data.dueDate || null,
        jobId: data.jobId || null,
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/count"] });
      toast({ title: "Task updated" });
      closeDialog();
    },
    onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/tasks/${id}`, {
        status: "completed",
        completedAt: new Date().toISOString(),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/count"] });
    },
    onError: () => toast({ title: "Failed to complete task", variant: "destructive" }),
  });

  const reopenMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/tasks/${id}`, {
        status: "open",
        completedAt: null,
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/count"] });
    },
    onError: () => toast({ title: "Failed to reopen task", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/count"] });
      toast({ title: "Task deleted" });
    },
    onError: () => toast({ title: "Failed to delete task", variant: "destructive" }),
  });

  function openCreate() {
    setEditingTask(null);
    setForm(initForm());
    setDialogOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      status: task.status,
      assignedToUserId: task.assignedToUserId ?? "",
      dueDate: task.dueDate ?? "",
      jobId: task.jobId ?? "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingTask(null);
    setForm(initForm());
  }

  function handleSubmit() {
    if (!form.title.trim()) return;
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const filtered = allTasks.filter((t) => {
    if (tab === "mine" && t.assignedToUserId !== user?.id) return false;
    if (filterAssignee && t.assignedToUserId !== filterAssignee) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    return true;
  });

  const openTasks = allTasks.filter((t) => t.status === "open");
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress");
  const completedTasks = allTasks.filter((t) => t.status === "completed");

  function getAssigneeName(userId?: string | null) {
    if (!userId) return null;
    const found = staffUsers.find((u) => u.id === userId);
    return found?.name || found?.username || found?.email || userId;
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function isDueSoon(dueDate?: string | null) {
    if (!dueDate) return false;
    const d = new Date(dueDate);
    return isPast(d) || isToday(d);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b flex-shrink-0 flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <Button onClick={openCreate} data-testid="button-new-task">
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* KPI cards */}
      <div className="px-6 pt-4 flex-shrink-0 grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold">{openTasks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold">{inProgressTasks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-1 pt-3 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="text-2xl font-bold">{completedTasks.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 flex-shrink-0 flex flex-wrap items-center gap-2 border-b">
        <div className="flex gap-1 rounded-md border p-0.5">
          <button
            className={`px-3 py-1 text-sm rounded transition-colors ${tab === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover-elevate"}`}
            onClick={() => setTab("all")}
            data-testid="tab-all-tasks"
          >
            All Tasks
          </button>
          <button
            className={`px-3 py-1 text-sm rounded transition-colors ${tab === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover-elevate"}`}
            onClick={() => setTab("mine")}
            data-testid="tab-my-tasks"
          >
            My Tasks
          </button>
        </div>

        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-40" data-testid="select-filter-assignee">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All people</SelectItem>
            {staffUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name || u.username || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        {(filterAssignee || filterStatus) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterAssignee(""); setFilterStatus(""); }}
            data-testid="button-clear-filters"
          >
            Clear filters
          </Button>
        )}

        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} task{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <CheckSquare className="h-10 w-10 opacity-30" />
            <p>No tasks found</p>
            <Button variant="outline" size="sm" onClick={openCreate}>Create one</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((task) => {
              const priorityCfg = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;
              const statusCfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open;
              const PriorityIcon = priorityCfg.icon;
              const StatusIcon = statusCfg.icon;
              const assigneeName = getAssigneeName(task.assignedToUserId);
              const overdue = task.status !== "completed" && isDueSoon(task.dueDate);

              return (
                <Card
                  key={task.id}
                  className={`transition-opacity ${task.status === "completed" ? "opacity-60" : ""}`}
                  data-testid={`card-task-${task.id}`}
                >
                  <CardContent className="px-4 py-3 flex flex-wrap items-start gap-3">
                    {/* Complete toggle */}
                    <button
                      className="mt-0.5 flex-shrink-0 text-muted-foreground hover-elevate rounded"
                      onClick={() => task.status === "completed" ? reopenMutation.mutate(task.id) : completeMutation.mutate(task.id)}
                      data-testid={`button-toggle-complete-${task.id}`}
                      title={task.status === "completed" ? "Reopen" : "Mark complete"}
                    >
                      <StatusIcon className={`h-5 w-5 ${statusCfg.class}`} />
                    </button>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                          {task.title}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${priorityCfg.badgeClass}`}>
                          <PriorityIcon className="h-3 w-3" />
                          {priorityCfg.label}
                        </span>
                        {task.status === "in_progress" && (
                          <Badge variant="secondary" className="text-xs">In Progress</Badge>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                      )}

                      {task.sourceMessageText && (
                        <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                          <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-1 italic">"{task.sourceMessageText}"</span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        {assigneeName && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Avatar className="h-4 w-4">
                              <AvatarFallback className="text-[9px]">{getInitials(assigneeName)}</AvatarFallback>
                            </Avatar>
                            <span>{assigneeName}</span>
                          </div>
                        )}
                        {!assigneeName && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>Unassigned</span>
                          </div>
                        )}
                        {task.dueDate && (
                          <span className={`text-xs ${overdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                            Due {format(new Date(task.dueDate), "dd MMM")}
                            {overdue && " (overdue)"}
                          </span>
                        )}
                        {task.jobId && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <LinkIcon className="h-3 w-3" />
                            <span>Job linked</span>
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {format(new Date(task.createdAt), "dd MMM")}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(task)}
                        data-testid={`button-edit-task-${task.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(task.id)}
                        data-testid={`button-delete-task-${task.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                placeholder="What needs to be done?"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                data-testid="input-task-title"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                placeholder="Optional details..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                data-testid="input-task-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="select-task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select value={form.assignedToUserId} onValueChange={(v) => setForm((f) => ({ ...f, assignedToUserId: v }))}>
                <SelectTrigger data-testid="select-task-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {staffUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name || u.username || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                data-testid="input-task-due-date"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-job">Job ID (optional)</Label>
              <Input
                id="task-job"
                placeholder="Link to a job..."
                value={form.jobId}
                onChange={(e) => setForm((f) => ({ ...f, jobId: e.target.value }))}
                data-testid="input-task-job-id"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.title.trim() || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-task"
            >
              {editingTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
