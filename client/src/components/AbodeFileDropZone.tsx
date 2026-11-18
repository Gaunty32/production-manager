import { useRef, useState } from "react";
import { Upload } from "lucide-react";

type Props = {
  label: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
};

/** Selection only: callers retain validation, matching and explicit save controls. */
export function AbodeFileDropZone({ label, accept, multiple = false, disabled = false, onFiles }: Props) {
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  return <label
    aria-disabled={disabled}
    className={`mt-3 flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center text-sm focus-within:ring-2 focus-within:ring-[#344e43] ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-stone-50"} ${dragging && !disabled ? "border-[#344e43] bg-emerald-50" : "border-stone-300"}`}
    onDragEnter={event => {
      event.preventDefault(); event.stopPropagation();
      if (disabled || !event.dataTransfer.types.includes("Files")) return;
      depth.current += 1; setDragging(true);
    }}
    onDragOver={event => {
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    }}
    onDragLeave={event => {
      event.preventDefault(); event.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDragging(false);
    }}
    onDrop={event => {
      event.preventDefault(); event.stopPropagation();
      depth.current = 0; setDragging(false);
      if (!disabled) onFiles(Array.from(event.dataTransfer.files));
    }}
  >
    <Upload aria-hidden="true" className="h-5 w-5 shrink-0 text-[#344e43]" />
    <span className="font-medium">{dragging && !disabled ? "Drop files here" : label}</span>
    <span className="text-xs text-stone-600">or <span className="underline underline-offset-2">choose {multiple ? "files" : "a file"}</span></span>
    <input className="sr-only" type="file" aria-label={label} accept={accept} multiple={multiple} disabled={disabled}
      onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (!disabled && files.length) onFiles(files);
      }} />
  </label>;
}
