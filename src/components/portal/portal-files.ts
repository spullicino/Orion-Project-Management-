"use client";

import { toast } from "sonner";
import { portalFileSaved, portalFileUpload } from "@/app/portal/actions";
import { uploadWithProgress } from "@/lib/offline/upload";

/** Photos are made smaller (still clear) so they upload quickly; other files go as they are. */
async function prepare(file: File): Promise<{ blob: Blob; name: string; type: string }> {
  if (!file.type.startsWith("image/") || ["image/heic", "image/heif", "image/gif"].includes(file.type)) return { blob: file, name: file.name, type: file.type || "application/octet-stream" };
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const small = await imageCompression(file, { maxWidthOrHeight: 2200, initialQuality: 0.85, maxSizeMB: 1.8, useWebWorker: true, fileType: "image/jpeg" });
    return { blob: small, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg" };
  } catch {
    return { blob: file, name: file.name, type: file.type };
  }
}

export async function uploadPortalFiles(number: number, messageId: string | null, files: File[]): Promise<boolean> {
  let ok = true;
  for (const file of files) {
    const { blob, name, type } = await prepare(file);
    const meta = { number, id: crypto.randomUUID(), messageId, fileName: name.slice(0, 200) || "file", mimeType: type, size: blob.size };
    const start = await portalFileUpload(meta);
    if (!start.ok) {
      toast.error(start.error);
      ok = false;
      continue;
    }
    try {
      await uploadWithProgress(start.data!.signedUrl, blob, () => {}, type);
      const saved = await portalFileSaved(meta);
      if (!saved.ok) throw new Error(saved.error);
    } catch {
      toast.error(`“${name}” didn't upload — please try again.`);
      ok = false;
    }
  }
  return ok;
}
