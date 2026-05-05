import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, ExternalLink, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type JobFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  createdAt: string;
};

type UploadedFile = {
  objectKey: string;
  fileName: string;
  fileSize: number;
  fileType: string;
};

type JobMessage = {
  id: string;
  senderType: string;
};

interface StaffJobFileUploadProps {
  jobId: string;
  onFileAdded?: () => void;
  autoMessageOnDownload?: boolean;
}

const AUTO_MESSAGE = "Thank you for submitting your files. They are being reviewed by our team.";

export function StaffJobFileUpload({ jobId, onFileAdded, autoMessageOnDownload = false }: StaffJobFileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const { toast } = useToast();

  const { data: existingFiles = [], isLoading } = useQuery<JobFile[]>({
    queryKey: ["/api/jobs", jobId, "files"],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/staff/jobs/${jobId}/messages`, { message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/staff/jobs/${jobId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/messages"] });
    },
  });

  const addFileMutation = useMutation({
    mutationFn: async (file: UploadedFile) => {
      const res = await apiRequest("POST", `/api/jobs/${jobId}/files`, {
        objectKey: file.objectKey,
        fileName: file.fileName,
        fileSize: file.fileSize,
        fileType: file.fileType,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/jobs/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      onFileAdded?.();
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest("DELETE", `/api/jobs/${jobId}/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/jobs/pending"] });
    },
  });

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setIsUploading(true);
    let successCount = 0;
    try {
      await Promise.all(files.map(async (file) => {
        const uploadRes = await apiRequest("POST", "/api/staff/objects/upload", {});
        const { url, key } = await uploadRes.json();
        await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        await addFileMutation.mutateAsync({
          objectKey: key,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || "application/octet-stream",
        });
        successCount++;
      }));
      if (successCount > 0) {
        toast({ title: `${successCount} file${successCount !== 1 ? "s" : ""} uploaded` });
      }
    } catch {
      toast({ title: "Failed to upload one or more files", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [addFileMutation, toast]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length) await uploadFiles(files);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) await uploadFiles(files);
  };

  const handleDownloadAll = async () => {
    const a = document.createElement("a");
    a.href = `/api/jobs/${jobId}/files/download-all`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (autoMessageOnDownload) {
      try {
        const res = await apiRequest("GET", `/api/staff/jobs/${jobId}/messages`);
        const messages: JobMessage[] = await res.json();
        const hasExistingMessages = Array.isArray(messages) && messages.length > 0;
        if (!hasExistingMessages) {
          await sendMessageMutation.mutateAsync(AUTO_MESSAGE);
          toast({ description: "Message sent to customer." });
        }
      } catch {
        // Non-critical — download still succeeded
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Files</span>
        {existingFiles.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadAll}
            data-testid="button-download-all-files"
            className="h-8 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Download All
          </Button>
        )}
      </div>

      {/* File list */}
      {!isLoading && existingFiles.length > 0 && (
        <div className="space-y-1">
          {existingFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-2 bg-muted rounded text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate">{file.fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  ({Math.round(file.fileSize / 1024)} KB)
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {file.fileUrl && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => window.open(`/api/img${file.fileUrl.replace('/objects', '')}`, '_blank')}
                    data-testid={`button-view-${file.id}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => deleteFileMutation.mutate(file.id)}
                  disabled={deleteFileMutation.isPending}
                  data-testid={`button-delete-${file.id}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-file-upload"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        disabled={isUploading}
        data-testid="dropzone-files"
        className={`w-full flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-6 px-4 transition-colors cursor-pointer
          ${isDragging
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/40"
          }
          ${isUploading ? "opacity-60 cursor-not-allowed" : ""}
        `}
      >
        <Upload className={`h-5 w-5 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
        <span className="text-sm font-medium">
          {isUploading ? "Uploading…" : isDragging ? "Drop files here" : "Drag & drop files, or click to browse"}
        </span>
        <span className="text-xs text-muted-foreground">Any file type accepted</span>
      </button>
    </div>
  );
}
