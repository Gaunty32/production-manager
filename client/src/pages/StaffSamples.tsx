import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
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
import { ObjectUploader } from "@/components/ObjectUploader";
import {
  Plus,
  FileText,
  ExternalLink,
  Trash2,
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
} from "lucide-react";
import { format } from "date-fns";

type SampleFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
};

type Sample = {
  id: string;
  customerId: string;
  customerName: string;
  jobId: string | null;
  title: string;
  description: string | null;
  status: "pending_approval" | "amends_required" | "approved";
  customerNotes: string | null;
  createdAt: string;
  updatedAt: string;
  files: SampleFile[];
};

type Customer = { id: string; name: string };
type Job = { id: string; jobName: string; customerId: string };

const STATUS_CONFIG = {
  pending_approval: {
    label: "Pending Approval",
    color: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200",
    icon: Clock,
  },
  amends_required: {
    label: "Amends Required",
    color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
    icon: AlertCircle,
  },
  approved: {
    label: "Approved",
    color: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
    icon: CheckCircle,
  },
};

type UploadedFile = { objectKey: string; fileName: string; fileSize: number; fileType: string };

export default function StaffSamples() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [showUploadFor, setShowUploadFor] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newJobId, setNewJobId] = useState("none");
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: samples = [], isLoading } = useQuery<Sample[]>({
    queryKey: ["/api/staff/samples"],
    refetchInterval: 30000,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const customerJobs = jobs.filter(j => j.customerId === newCustomerId);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/staff/samples", {
        customerId: newCustomerId,
        jobId: newJobId === "none" ? null : newJobId,
        title: newTitle,
        description: newDesc || null,
      });
      const sample = await res.json();
      // Attach any pending files
      await Promise.all(
        pendingFiles.map(f =>
          apiRequest("POST", `/api/staff/samples/${sample.id}/files`, {
            objectKey: f.objectKey,
            fileName: f.fileName,
            fileSize: f.fileSize,
            fileType: f.fileType,
          })
        )
      );
      return sample;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/samples"] });
      toast({ title: "Sample created and sent to customer" });
      setShowCreate(false);
      setNewTitle(""); setNewDesc(""); setNewCustomerId(""); setNewJobId("none");
      setPendingFiles([]);
    },
    onError: () => toast({ title: "Failed to create sample", variant: "destructive" }),
  });

  const addFileMutation = useMutation({
    mutationFn: async ({ sampleId, file }: { sampleId: string; file: UploadedFile }) => {
      await apiRequest("POST", `/api/staff/samples/${sampleId}/files`, {
        objectKey: file.objectKey,
        fileName: file.fileName,
        fileSize: file.fileSize,
        fileType: file.fileType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/samples"] });
      setShowUploadFor(null);
    },
    onError: () => toast({ title: "Failed to attach file", variant: "destructive" }),
  });

  const deleteFileMutation = useMutation({
    mutationFn: async ({ sampleId, fileId }: { sampleId: string; fileId: string }) => {
      await apiRequest("DELETE", `/api/staff/samples/${sampleId}/files/${fileId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/staff/samples"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/staff/samples/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/samples"] });
      toast({ title: "Sample deleted" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/staff/samples/${id}`, { status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/staff/samples"] }),
  });

  const filtered = statusFilter === "all" ? samples : samples.filter(s => s.status === statusFilter);

  const grouped = {
    pending_approval: filtered.filter(s => s.status === "pending_approval"),
    amends_required: filtered.filter(s => s.status === "amends_required"),
    approved: filtered.filter(s => s.status === "approved"),
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Sample Approvals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Send samples to customers for review</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Samples</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="amends_required">Amends Required</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreate(true)} data-testid="button-new-sample">
            <Plus className="h-4 w-4 mr-2" />
            New Sample
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : samples.length === 0 ? (
          <div className="text-center py-20">
            <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-sm font-medium text-muted-foreground">No samples yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create a new sample to send to a customer for approval
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {(["pending_approval", "amends_required", "approved"] as const).map(status => {
              const group = grouped[status];
              if (group.length === 0) return null;
              const cfg = STATUS_CONFIG[status];
              const Icon = cfg.icon;
              return (
                <div key={status}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {cfg.label}
                    </h2>
                    <span className="text-xs text-muted-foreground/60">({group.length})</span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {group.map(sample => (
                      <SampleCard
                        key={sample.id}
                        sample={sample}
                        onDelete={() => deleteMutation.mutate(sample.id)}
                        onDeleteFile={(fileId) => deleteFileMutation.mutate({ sampleId: sample.id, fileId })}
                        onAddFile={() => setShowUploadFor(sample.id)}
                        onStatusChange={(s) => updateStatusMutation.mutate({ id: sample.id, status: s })}
                        isUploadingFor={showUploadFor === sample.id}
                        onUploadComplete={(file) => {
                          addFileMutation.mutate({ sampleId: sample.id, file });
                        }}
                        onCancelUpload={() => setShowUploadFor(null)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg" data-testid="dialog-create-sample">
          <DialogHeader>
            <DialogTitle>New Sample</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Customer *</label>
              <Select value={newCustomerId} onValueChange={(v) => { setNewCustomerId(v); setNewJobId("none"); }}>
                <SelectTrigger data-testid="select-sample-customer">
                  <SelectValue placeholder="Select customer…" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Title *</label>
              <Input
                placeholder="e.g. Logo embroidery sample – polo shirt"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                data-testid="input-sample-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
              <Textarea
                placeholder="Describe the sample or add any notes for the customer…"
                rows={3}
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                data-testid="input-sample-description"
              />
            </div>
            {newCustomerId && customerJobs.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Link to Job (optional)</label>
                <Select value={newJobId} onValueChange={setNewJobId}>
                  <SelectTrigger data-testid="select-sample-job">
                    <SelectValue placeholder="No job linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No job linked</SelectItem>
                    {customerJobs.map(j => (
                      <SelectItem key={j.id} value={j.id}>{j.jobName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Sample Files</label>
              {pendingFiles.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {pendingFiles.map(f => (
                    <div key={f.objectKey} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{f.fileName}</span>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingFiles(prev => prev.filter(x => x.objectKey !== f.objectKey))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <ObjectUploader
                maxNumberOfFiles={10}
                onGetUploadParameters={async () => {
                  const res = await apiRequest("POST", "/api/staff/samples/objects/upload", {});
                  const data = await res.json();
                  return { method: "PUT" as const, url: data.url, key: data.key };
                }}
                onComplete={(result) => {
                  result.successful?.forEach((file: any) => {
                    setPendingFiles(prev => [...prev, {
                      objectKey: file.meta.key,
                      fileName: file.name,
                      fileSize: file.size,
                      fileType: file.type || "application/octet-stream",
                    }]);
                  });
                }}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Files
              </ObjectUploader>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newTitle.trim() || !newCustomerId || createMutation.isPending}
              data-testid="button-create-sample-submit"
            >
              {createMutation.isPending ? "Creating…" : "Create & Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SampleCard({
  sample,
  onDelete,
  onDeleteFile,
  onAddFile,
  onStatusChange,
  isUploadingFor,
  onUploadComplete,
  onCancelUpload,
}: {
  sample: Sample;
  onDelete: () => void;
  onDeleteFile: (fileId: string) => void;
  onAddFile: () => void;
  onStatusChange: (status: string) => void;
  isUploadingFor: boolean;
  onUploadComplete: (file: UploadedFile) => void;
  onCancelUpload: () => void;
}) {
  const cfg = STATUS_CONFIG[sample.status];
  const Icon = cfg.icon;

  return (
    <Card data-testid={`sample-card-${sample.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate text-sm">{sample.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{sample.customerName}</p>
          </div>
          <Badge className={`${cfg.color} flex-shrink-0 flex items-center gap-1 text-xs`}>
            <Icon className="h-3 w-3" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sample.description && (
          <p className="text-sm text-muted-foreground">{sample.description}</p>
        )}
        {sample.customerNotes && sample.status === "amends_required" && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md p-2.5">
            <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Customer notes</p>
            <p className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap">{sample.customerNotes}</p>
          </div>
        )}

        {/* Files */}
        <div className="space-y-1.5">
          {sample.files.map(f => (
            <div key={f.id} className="flex items-center gap-2 p-2 bg-muted rounded-md text-xs">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{f.fileName}</span>
              <span className="text-muted-foreground shrink-0">
                {Math.round(f.fileSize / 1024)} KB
              </span>
              <a
                href={`/api/img${f.fileUrl.replace("/objects", "")}`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground shrink-0"
                data-testid={`link-sample-file-${f.id}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                onClick={() => onDeleteFile(f.id)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                data-testid={`button-delete-sample-file-${f.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Add file */}
        {isUploadingFor ? (
          <div className="flex items-center gap-2">
            <ObjectUploader
              maxNumberOfFiles={5}
              onGetUploadParameters={async () => {
                const res = await apiRequest("POST", "/api/staff/samples/objects/upload", {});
                const data = await res.json();
                return { method: "PUT" as const, url: data.url, key: data.key };
              }}
              onComplete={(result) => {
                result.successful?.forEach((file: any) => {
                  onUploadComplete({
                    objectKey: file.meta.key,
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type || "application/octet-stream",
                  });
                });
              }}
              buttonClassName="h-8 text-xs"
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload
            </ObjectUploader>
            <Button size="sm" variant="ghost" onClick={onCancelUpload} className="h-8 text-xs">
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={onAddFile}
            className="w-full h-8 text-xs"
            data-testid={`button-add-file-${sample.id}`}
          >
            <Upload className="h-3 w-3 mr-1.5" />
            Add File
          </Button>
        )}

        {/* Status actions */}
        {sample.status !== "approved" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStatusChange("approved")}
            className="w-full h-8 text-xs text-green-700 dark:text-green-400 border-green-300 dark:border-green-700"
            data-testid={`button-mark-approved-${sample.id}`}
          >
            <CheckCircle className="h-3 w-3 mr-1.5" />
            Mark as Approved
          </Button>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {format(new Date(sample.updatedAt), "d MMM, h:mm a")}
          </span>
          <button
            onClick={onDelete}
            className="text-xs text-muted-foreground hover:text-destructive"
            data-testid={`button-delete-sample-${sample.id}`}
          >
            Delete
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
