import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadAbodeFinishedPhoto } from "@/lib/abodeFinishedPhotoUpload";
import { AbodeFileDropZone } from "@/components/AbodeFileDropZone";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type AbodeFinishedPhoto = {
  id: string;
  fileName: string;
  fileUrl: string;
  createdAt: string;
  lineItemId?: string | null;
};

interface AbodeFinishedPhotosProps {
  jobId: string;
  photos?: AbodeFinishedPhoto[];
  isStaff: boolean;
  lineItemId?: string | null;
  canUpload?: boolean;
  onChanged: () => void;
}

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function AbodeFinishedPhotos({ jobId, photos = [], isStaff, lineItemId, canUpload = true, onChanged }: AbodeFinishedPhotosProps) {
  const uploadLock = useRef(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<AbodeFinishedPhoto | null>(null);
  const { toast } = useToast();

  const scopedPhotos = photos.filter((photo) => (photo.lineItemId ?? null) === (lineItemId ?? null));
  const canAddPhoto = isStaff && canUpload && Boolean(lineItemId);
  if (!canAddPhoto && scopedPhotos.length === 0) return null;

  const uploadPhotos = async (files: File[]) => {
    if (!files.length || uploadLock.current || !canAddPhoto || !lineItemId) return;
    uploadLock.current = true;
    setIsUploading(true);
    setUploadErrors([]);
    let saved = 0;
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        setUploadProgress(`${index + 1} of ${files.length}: ${file.name}`);
        try {
          await uploadAbodeFinishedPhoto(file, { jobId, lineItemId });
          saved += 1;
        } catch (error) {
          setUploadErrors(current => [...current, `${file.name}: ${friendlyError(error)}`]);
        }
      }
      if (saved) {
        toast({ title: saved === 1 ? "Finished photo saved" : `${saved} finished photos saved`, description: "Available on this order for the customer." });
        onChanged();
      }
    } finally {
      uploadLock.current = false;
      setIsUploading(false);
      setUploadProgress("");
    }
  };

  return (
    <section className="border-t border-stone-100 px-4 py-4 md:px-5" aria-label="Finished photos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-stone-800">Finished photos</h4>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {isStaff ? "Keep a visual record of the completed personalisation." : "A look at the finished personalisation for your order."}
          </p>
        </div>
      </div>

      {canAddPhoto && <>
        <AbodeFileDropZone label="Drag and drop finished photos here"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple disabled={isUploading} onFiles={files => void uploadPhotos(files)} />
        <p className="mt-2 text-xs leading-5 text-stone-500">JPEG, PNG or WebP · maximum 10 MB each. Drop multiple photos or choose from your phone. Photos are saved to this stocking on the customer's order.</p>
      </>}
      {isUploading && (
        <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-[#d6c3ae] bg-[#fbf8f3] px-3 py-2.5 text-sm text-stone-700">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#8a4e3d]" />
          Saving {uploadProgress || "your photos"}…
        </div>
      )}
      {uploadErrors.length > 0 && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
        <p className="font-medium">These photos were not saved. Drop them again to retry.</p>
        <ul className="mt-1 space-y-1">{uploadErrors.map((error, index) => <li className="break-words" key={index}>{error}</li>)}</ul>
      </div>}

      {scopedPhotos.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {scopedPhotos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setSelectedPhoto(photo)}
              className="group relative aspect-[4/3] min-h-24 overflow-hidden rounded-lg border border-stone-200 bg-[#f8f6f2] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#344e43] focus-visible:ring-offset-2"
              aria-label={`View finished photo: ${photo.fileName}`}
            >
              <img src={photo.fileUrl} alt={photo.fileName} loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-stone-950/75 to-transparent px-2 pb-2 pt-6 text-left text-xs font-medium text-white">
                {photo.fileName}
              </span>
            </button>
          ))}
        </div>
      ) : canAddPhoto ? (
        <div className="mt-3 flex min-h-20 items-center gap-3 rounded-lg border border-dashed border-stone-300 bg-stone-50/70 px-3 py-3 text-sm text-stone-600">
          <ImagePlus className="h-5 w-5 shrink-0 text-stone-400" />
          <span>No finished photos yet. Drop them above whenever a piece is ready.</span>
        </div>
      ) : null}

      <Dialog open={Boolean(selectedPhoto)} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-hidden border-stone-200 bg-[#fbfaf7] p-0">
          <DialogHeader className="flex flex-row items-start justify-between gap-4 px-4 pb-0 pt-4 sm:px-6 sm:pt-5">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{selectedPhoto?.fileName}</DialogTitle>
              <DialogDescription>
                {selectedPhoto?.createdAt ? `Added ${new Date(selectedPhoto.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : "Finished personalisation photo"}
              </DialogDescription>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setSelectedPhoto(null)} aria-label="Close photo">
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <div className="flex max-h-[calc(92dvh-6rem)] min-h-40 items-center justify-center overflow-auto bg-stone-100 p-2 sm:p-4">
            {selectedPhoto && <img src={selectedPhoto.fileUrl} alt={selectedPhoto.fileName} className="max-h-[calc(92dvh-8rem)] max-w-full rounded-md object-contain" />}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
