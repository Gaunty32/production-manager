# Profile Pictures — Implementation Guide

Copy-paste guide to add user profile pictures (upload → crop → store → display) to another Replit app.
Works with: React + Express + Drizzle (PostgreSQL) + Replit Object Storage + shadcn/ui.

**Prerequisite:** In the other app, set up Replit Object Storage (the "Object Storage" tool creates a bucket and sets `PRIVATE_OBJECT_DIR` + `PUBLIC_OBJECT_SEARCH_PATHS` env vars). Install the npm package `@google-cloud/storage`.

## How it works (the flow)

1. User picks an image file → a crop dialog opens (drag + zoom, circular crop).
2. On confirm, the cropped image becomes a JPEG blob.
3. The frontend asks the backend for a **signed upload URL** (`POST /api/objects/upload`).
4. The browser uploads the blob **directly to cloud storage** with a `PUT` (never through your server — avoids upload size limits).
5. The frontend saves the resulting key to the user's `profileImageUrl` in the database.
6. Images are served back through `GET /api/img/*`, which streams from storage with caching.

---

## 1. Database — add a column

```ts
// shared/schema.ts — add to your users table
profileImageUrl: varchar("profile_image_url"),
```

Then run `npm run db:push` (or your migration flow).

Storage helper:

```ts
// server/storage.ts
async updateUserProfileImage(id: string, profileImageUrl: string): Promise<void> {
  await db.update(users).set({ profileImageUrl }).where(eq(users.id, id));
}
```

---

## 2. Backend — object storage service

Create `server/objectStorage.ts`:

```ts
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const pathParts = path.split("/");
  if (pathParts.length < 3) throw new Error("Invalid path: must contain at least a bucket name");
  return { bucketName: pathParts[1], objectName: pathParts.slice(2).join("/") };
}

async function signObjectURL({
  bucketName, objectName, method, ttlSec,
}: {
  bucketName: string; objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD"; ttlSec: number;
}): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to sign object URL, errorcode: ${response.status}, make sure you're running on Replit`);
  }
  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR not set. Create a bucket in the 'Object Storage' tool.");
    }
    return dir;
  }

  // Signed URL for browser-direct PUT upload + the key to store in the DB
  async getObjectEntityUploadURLWithKey(): Promise<{ url: string; key: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const url = await signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
    return { url, key: `/objects/uploads/${objectId}` };
  }

  // Look up a stored object by its logical /objects/... path
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) throw new ObjectNotFoundError();
    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
    const { bucketName, objectName } = parseObjectPath(`${entityDir}${entityId}`);
    const objectFile = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) throw new ObjectNotFoundError();
    return objectFile;
  }

  // Stream a file to the HTTP response with cache headers
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });
      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) res.status(500).json({ error: "Error downloading file" });
    }
  }
}
```

---

## 3. Backend — routes

Add to `server/routes.ts` (replace `isAuthenticated` with your own auth middleware):

```ts
import { ObjectStorageService } from "./objectStorage";

// 3a. Serve stored images: <img src="/api/img/uploads/<id>" />
// A distinct /api/img path avoids CDN/static-file interception.
app.get("/api/img/*", async (req, res) => {
  try {
    const svc = new ObjectStorageService();
    // /api/img/uploads/uuid → /objects/uploads/uuid  (collapse repeated prefixes defensively)
    const suffix = req.path.replace(/^(\/api\/img)+/, "");
    const file = await svc.getObjectEntityFile(`/objects${suffix}`);
    await svc.downloadObject(file, res, 86400); // cache 24h
  } catch (err: any) {
    if (err?.name === "ObjectNotFoundError") return res.status(404).json({ error: "Not found" });
    console.error("Object serve error:", err);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

// 3b. Give the browser a signed upload URL
app.post("/api/objects/upload", isAuthenticated, async (_req, res) => {
  try {
    const svc = new ObjectStorageService();
    const { url, key } = await svc.getObjectEntityUploadURLWithKey();
    res.json({ url, key });
  } catch (error) {
    console.error("Error getting upload URL:", error);
    res.status(500).json({ error: "Failed to get upload URL" });
  }
});

// 3c. Save the user's profile picture URL
app.put("/api/me/profile-picture", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.session.userId; // adapt to your session shape
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const { profileImageUrl } = req.body;
    if (!profileImageUrl) return res.status(400).json({ error: "profileImageUrl required" });
    await storage.updateUserProfileImage(userId, profileImageUrl);
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    res.status(500).json({ error: "Failed to update profile picture" });
  }
});
```

---

## 4. Frontend — crop dialog component

Create `client/src/components/ImageCropDialog.tsx` (no extra libraries needed — plain canvas, works with mouse + touch):

```tsx
import { useRef, useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut } from "lucide-react";

interface ImageCropDialogProps {
  file: File | null;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

const CANVAS_SIZE = 280;

export function ImageCropDialog({ file, onConfirm, onCancel }: ImageCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    if (!file) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setImgLoaded(false);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = URL.createObjectURL(file);
    return () => URL.revokeObjectURL(img.src);
  }, [file]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    const scale = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight) * zoom;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (CANVAS_SIZE - w) / 2 + offset.x;
    const y = (CANVAS_SIZE - h) / 2 + offset.y;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = "hsl(var(--border))";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [imgLoaded, zoom, offset]);

  useEffect(() => {
    draw();
  }, [draw]);

  const clampOffset = useCallback((ox: number, oy: number, z: number): { x: number; y: number } => {
    const img = imgRef.current;
    if (!img) return { x: ox, y: oy };
    const scale = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight) * z;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const maxX = (w - CANVAS_SIZE) / 2;
    const maxY = (h - CANVAS_SIZE) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, zoom));
  }, [dragging, zoom, clampOffset]);

  const handleMouseUp = () => setDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setDragging(true);
    dragStart.current = { mx: t.clientX, my: t.clientY, ox: offset.x, oy: offset.y };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging || !dragStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - dragStart.current.mx;
    const dy = t.clientY - dragStart.current.my;
    setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, zoom));
  };

  const handleZoomChange = (val: number[]) => {
    const z = val[0];
    setZoom(z);
    setOffset(prev => clampOffset(prev.x, prev.y, z));
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) onConfirm(blob);
    }, "image/jpeg", 0.92);
  };

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Profile Photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div
            className="rounded-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
            style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => setDragging(false)}
            data-testid="image-crop-canvas-wrapper"
          >
            <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="block" />
          </div>

          <p className="text-xs text-muted-foreground">Drag to reposition</p>

          <div className="flex items-center gap-3 w-full px-2">
            <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider
              min={1}
              max={3}
              step={0.05}
              value={[zoom]}
              onValueChange={handleZoomChange}
              className="flex-1"
              data-testid="slider-zoom"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} data-testid="button-crop-cancel">Cancel</Button>
          <Button onClick={handleConfirm} data-testid="button-crop-confirm">Save Photo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 5. Frontend — wiring it up in a page

```tsx
import { useRef, useState } from "react";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function ProfilePictureUploader({ currentUrl, initials, onUpdated }: {
  currentUrl?: string | null;
  initials: string;
  onUpdated: () => void; // e.g. refetch the "me" query
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingCropFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropConfirm = async (blob: Blob) => {
    setPendingCropFile(null);
    setIsUploading(true);
    try {
      // 1. Get a signed upload URL
      const uploadRes = await apiRequest("POST", "/api/objects/upload", {});
      const { url, key } = await uploadRes.json();
      // 2. Upload directly to cloud storage (browser → GCS, not via your server)
      await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
      // 3. Save the served path to the user record
      const normalizedKey = key.startsWith("/api/img") ? key : `/api/img${key.replace("/objects", "")}`;
      await apiRequest("PUT", "/api/me/profile-picture", { profileImageUrl: normalizedKey });
      onUpdated();
      toast({ title: "Profile picture updated" });
    } catch {
      toast({ title: "Failed to upload profile picture", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <Avatar className="h-16 w-16">
        <AvatarImage src={currentUrl ?? undefined} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-profile-picture"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        data-testid="button-upload-profile-picture"
      >
        {isUploading ? "Uploading…" : "Change photo"}
      </Button>
      <ImageCropDialog
        file={pendingCropFile}
        onConfirm={handleCropConfirm}
        onCancel={() => setPendingCropFile(null)}
      />
    </>
  );
}
```

Displaying elsewhere in the app is just:

```tsx
<Avatar>
  <AvatarImage src={user.profileImageUrl ?? undefined} />
  <AvatarFallback>{user.firstName?.[0]}{user.lastName?.[0]}</AvatarFallback>
</Avatar>
```

---

## Notes & gotchas

- **Store the `/api/img/...` path in the DB** (as the frontend snippet does) so `<img src>` works directly everywhere.
- **Direct-to-storage upload matters**: routing uploads through the server hits a ~32MB hard limit on Replit Autoscale deployments. The signed-URL PUT avoids this entirely.
- The signed upload URL expires after 15 minutes — always fetch a fresh one per upload.
- Cropped output is a fixed 280×280 JPEG at 92% quality, so profile images stay small.
- The `/api/img/*` serving route works in both dev and production; images are cached for 24h.
- Adapt `isAuthenticated` and `req.session.userId` to whatever auth your other app uses.
