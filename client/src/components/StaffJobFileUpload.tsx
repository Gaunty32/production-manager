import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Upload, FileText, X, ExternalLink } from "lucide-react";

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

interface StaffJobFileUploadProps {
  jobId: string;
  onFileAdded?: () => void;
}

export function StaffJobFileUpload({ jobId, onFileAdded }: StaffJobFileUploadProps) {
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);

  const { data: existingFiles = [], isLoading } = useQuery<JobFile[]>({
    queryKey: ["/api/jobs", jobId, "files"],
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

  const handleFileUploaded = async (file: UploadedFile) => {
    await addFileMutation.mutateAsync(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Files</span>
        <ObjectUploader
          maxNumberOfFiles={10}
          onGetUploadParameters={async () => {
            const res = await apiRequest("POST", "/api/staff/objects/upload", {});
            const data = await res.json();
            return {
              method: "PUT" as const,
              url: data.url,
              key: data.key,
            };
          }}
          onComplete={(result) => {
            result.successful?.forEach((file: any) => {
              const objectKey = file.meta.key as string;
              handleFileUploaded({
                objectKey,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type || "application/octet-stream",
              });
            });
          }}
          buttonClassName="h-8"
        >
          <Upload className="h-3 w-3 mr-1" />
          Upload
        </ObjectUploader>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading files...</p>
      ) : existingFiles.length === 0 ? (
        <p className="text-xs text-muted-foreground">No files attached</p>
      ) : (
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
                    onClick={() => window.open(`/objects${file.fileUrl.replace('/objects', '')}`, '_blank')}
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
    </div>
  );
}
