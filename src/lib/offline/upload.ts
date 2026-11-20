"use client";

import { env } from "@/lib/env";

/** Thrown for connection problems: the outbox keeps the item and retries later. */
export class NetworkError extends Error {}

/**
 * Uploads a Blob to a Supabase signed upload URL with progress reporting
 * (fetch() can't report upload progress, XMLHttpRequest can).
 */
export function uploadWithProgress(signedUrl: string, blob: Blob, onProgress?: (loaded: number) => void, contentType = "image/jpeg"): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("apikey", env.supabasePublishableKey);
    xhr.setRequestHeader("content-type", contentType || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("cache-control", "max-age=31536000");
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(blob.size);
        resolve();
      } else if (xhr.status >= 500 || xhr.status === 0) reject(new NetworkError(`Upload failed (${xhr.status})`));
      else reject(new Error(`The photo was refused (${xhr.status}). ${xhr.responseText.slice(0, 120)}`));
    };
    xhr.onerror = () => reject(new NetworkError("No connection"));
    xhr.ontimeout = () => reject(new NetworkError("The connection is too slow"));
    xhr.send(blob);
  });
}
