import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Lightbulb, ChevronUp, ChevronDown, User, Users,
  CheckCircle2, Clock, Rocket, XCircle, Eye, ListOrdered,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FeatureRequest } from "@shared/schema";

const STATUS_META: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  new:         { label: "New",         color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",      icon: Lightbulb },
  reviewed:    { label: "Reviewed",    color: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",     icon: Eye },
  planned:     { label: "Planned",     color: "bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200", icon: ListOrdered },
  in_progress: { label: "In Progress", color: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200",  icon: Rocket },
  done:        { label: "Done",        color: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",  icon: CheckCircle2 },
  declined:    { label: "Declined",    color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",          icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.new;
  const Icon = meta.icon;
  return (
    <Badge variant="secondary" className={`${meta.color} gap-1 whitespace-nowrap`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </Badge>
  );
}

export default function FeatureRequests() {
  const { toast } = useToast();
  const [tab, setTab] = useState("all");
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({});

  const { data: requests = [], isLoading } = useQuery<FeatureRequest[]>({
    queryKey: ["/api/feature-requests"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; status?: string; priority?: number | null; adminNotes?: string }) =>
      apiRequest("PATCH", `/api/feature-requests/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/feature-requests"] }),
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const sorted = [...requests]
    .filter(r => tab === "all" || r.status === tab)
    .sort((a, b) => {
      if (a.priority !== null && b.priority !== null) return a.priority - b.priority;
      if (a.priority !== null) return -1;
      if (b.priority !== null) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const ranked = sorted.filter(r => r.priority !== null);
  const unranked = sorted.filter(r => r.priority === null);
  const displayed = [...ranked, ...unranked];

  const movePriority = (req: FeatureRequest, dir: "up" | "down") => {
    const allRanked = requests.filter(r => r.priority !== null).sort((a, b) => a.priority! - b.priority!);
    const idx = allRanked.findIndex(r => r.id === req.id);
    if (dir === "up" && idx <= 0) return;
    if (dir === "down" && idx >= allRanked.length - 1) return;
    const swapWith = allRanked[dir === "up" ? idx - 1 : idx + 1];
    updateMutation.mutate({ id: req.id, priority: swapWith.priority });
    updateMutation.mutate({ id: swapWith.id, priority: req.priority });
  };

  const setPriority = (req: FeatureRequest) => {
    const maxPriority = requests.filter(r => r.priority !== null).reduce((m, r) => Math.max(m, r.priority!), 0);
    updateMutation.mutate({ id: req.id, priority: maxPriority + 1 });
  };

  const unsetPriority = (req: FeatureRequest) => {
    updateMutation.mutate({ id: req.id, priority: null });
  };

  const saveNotes = (req: FeatureRequest) => {
    const notes = editingNotes[req.id] ?? req.adminNotes ?? "";
    updateMutation.mutate({ id: req.id, adminNotes: notes });
    setEditingNotes(prev => { const n = { ...prev }; delete n[req.id]; return n; });
    toast({ title: "Notes saved" });
  };

  const newCount = requests.filter(r => r.status === "new").length;

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-primary" /> Feature Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {requests.length} suggestion{requests.length !== 1 ? "s" : ""} submitted
            {newCount > 0 && <span className="ml-2 text-blue-600 dark:text-blue-400 font-medium">· {newCount} new</span>}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all">
            All <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{requests.length}</Badge>
          </TabsTrigger>
          {Object.entries(STATUS_META).map(([key, meta]) => {
            const count = requests.filter(r => r.status === key).length;
            return count > 0 ? (
              <TabsTrigger key={key} value={key}>
                {meta.label} <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{count}</Badge>
              </TabsTrigger>
            ) : null;
          })}
        </TabsList>
      </Tabs>

      {displayed.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Lightbulb className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No feature requests yet.</p>
          <p className="text-sm mt-1">Staff and customers will see a "Suggest a Feature" button in the app.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((req, idx) => {
            const isEditing = req.id in editingNotes;
            const isNew = req.status === "new";
            return (
              <div
                key={req.id}
                className={`rounded-lg border bg-card p-4 space-y-3 ${isNew ? "border-blue-200 dark:border-blue-800" : ""}`}
                data-testid={`feature-request-${req.id}`}
              >
                {/* Header row */}
                <div className="flex items-start gap-3 flex-wrap">
                  {/* Priority controls */}
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    {req.priority !== null ? (
                      <>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => movePriority(req, "up")} disabled={idx === 0 || ranked[0]?.id === req.id && idx === 0}>
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-xs font-bold text-primary w-6 text-center leading-none py-0.5">#{req.priority}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => movePriority(req, "down")} disabled={idx === ranked.length - 1}>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="text-xs px-2 h-7" onClick={() => setPriority(req)}>
                        Rank
                      </Button>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="font-semibold text-sm leading-snug">{req.title}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={req.status} />
                        {req.priority !== null && (
                          <button onClick={() => unsetPriority(req)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                            unrank
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{req.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        {req.submitterType === "staff" ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                        {req.submitterName}
                        <span className="opacity-60">({req.submitterType})</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(req.createdAt), "d MMM yyyy, HH:mm")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Controls row */}
                <div className="flex items-start gap-3 pt-1 border-t border-border/50 flex-wrap">
                  <div className="shrink-0">
                    <Select
                      value={req.status}
                      onValueChange={(v) => updateMutation.mutate({ id: req.id, status: v })}
                    >
                      <SelectTrigger className="h-8 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_META).map(([key, meta]) => (
                          <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-0 flex items-start gap-2">
                    <Textarea
                      placeholder="Add private notes…"
                      rows={1}
                      className="text-xs resize-none min-h-0 h-8 py-1.5"
                      value={isEditing ? editingNotes[req.id] : (req.adminNotes ?? "")}
                      onChange={e => setEditingNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                      onFocus={() => { if (!isEditing) setEditingNotes(prev => ({ ...prev, [req.id]: req.adminNotes ?? "" })); }}
                    />
                    {isEditing && (
                      <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => saveNotes(req)}>
                        Save
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
