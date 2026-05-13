import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, ExternalLink, Paperclip } from "lucide-react";
import { format } from "date-fns";

type JobFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  createdAt: string;
};

interface JobFilesDialogProps {
  job: { id: string; jobName: string; jobNumber: number } | null;
  onClose: () => void;
}

function normalizeFileUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/objects/")) return url.replace("/objects", "/api/img");
  if (url.startsWith("objects/")) return "/" + url.replace("objects/", "api/img/");
  return url;
}

function humanFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function JobFilesDialog({ job, onClose }: JobFilesDialogProps) {
  const { data: files = [], isLoading } = useQuery<JobFile[]>({
    queryKey: ["/api/jobs", job?.id, "files"],
    enabled: !!job,
  });

  const staffFiles = files.filter(f => f.uploadedBy === "staff");
  const customerFiles = files.filter(f => f.uploadedBy === "customer");

  function renderFileList(list: JobFile[]) {
    if (list.length === 0) return <p className="text-sm text-muted-foreground italic py-2">None</p>;
    return (
      <ul className="space-y-1.5">
        {list.map(file => {
          const href = normalizeFileUrl(file.fileUrl);
          const isImage = file.fileType?.startsWith("image") || file.fileType === "image";
          return (
            <li key={file.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={file.fileName}>{file.fileName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(file.createdAt), "d MMM yyyy, HH:mm")}
                  {file.fileSize > 0 && ` · ${humanFileSize(file.fileSize)}`}
                </p>
              </div>
              <a
                href={`${href}?filename=${encodeURIComponent(file.fileName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Button variant="ghost" size="icon" className="h-7 w-7" title={isImage ? "Open" : "Download"}>
                  {isImage ? <ExternalLink className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                </Button>
              </a>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Files — #{job?.jobNumber} {job?.jobName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading files…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No files attached to this job.</p>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            {customerFiles.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From Customer</span>
                  <Badge variant="secondary" className="text-xs">{customerFiles.length}</Badge>
                </div>
                {renderFileList(customerFiles)}
              </div>
            )}
            {staffFiles.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From Staff</span>
                  <Badge variant="secondary" className="text-xs">{staffFiles.length}</Badge>
                </div>
                {renderFileList(staffFiles)}
              </div>
            )}
          </div>
        )}

        {!isLoading && files.length > 0 && (
          <div className="pt-2 border-t">
            <a href={`/api/jobs/${job?.id}/files/download-all`} download>
              <Button variant="outline" size="sm" className="w-full">
                <Download className="h-3.5 w-3.5 mr-2" />
                Download All as ZIP
              </Button>
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
