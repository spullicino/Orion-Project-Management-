"use client";

import { createDailyUpdate, createPhotoUploads, registerPhotos } from "@/app/(app)/daily-update/actions";
import { outbox, type OutboxItem } from "./outbox";
import { NetworkError, uploadWithProgress } from "./upload";

export type SyncProgress = { ref: string; done: number; total: number; photosDone: number; photosTotal: number };
export type SyncResult = { sent: string[]; failed: { ref: string; error: string }[]; offline: boolean; signedOut: boolean };

const PHOTO_BATCH = 5;

/** Thrown when the person's sign-in has expired: keep everything and wait until they sign in again. */
export class SignedOutError extends NetworkError {}

/** Returns the action's data, or throws the right kind of error. */
function check<D>(res: { ok: true; data?: D } | { ok: false; error: string }): D {
  if (!res.ok) {
    if (res.error === "SIGNED_OUT") throw new SignedOutError("Please sign in again to send your updates.");
    throw new Error(res.error);
  }
  return res.data as D;
}

/** Server actions throw (instead of returning an error) when there is no connection. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new NetworkError((e as Error).message || "No connection");
  }
}

async function sendItem(item: OutboxItem, onProgress: (p: SyncProgress) => void) {
  const pending = item.photos.filter((p) => !p.uploaded);
  const total = 1 + item.photos.reduce((n, p) => n + p.full.size + p.thumb.size, 0);
  let doneBytes = item.photos.filter((p) => p.uploaded).reduce((n, p) => n + p.full.size + p.thumb.size, 0);
  let photosDone = item.photos.length - pending.length;
  const report = (extra = 0) =>
    onProgress({ ref: item.client_ref, done: doneBytes + extra, total, photosDone, photosTotal: item.photos.length });
  report();

  // 1. The update itself (safe to repeat: the server recognises client_ref).
  if (!item.update_id) {
    const res = await call(() =>
      createDailyUpdate({
        client_ref: item.client_ref,
        project_id: item.project_id,
        work_date: item.work_date,
        work_done: item.work_done,
        hours: item.hours,
        issues: item.issues,
      }),
    );
    item.update_id = check(res).id;
    await outbox.put(item);
  }
  doneBytes += 1;
  report();

  // 2. Photos, a few at a time; each one is marked done as soon as it is safely stored.
  for (let i = 0; i < pending.length; i += PHOTO_BATCH) {
    const batch = pending.slice(i, i + PHOTO_BATCH);
    const tickets = await call(() =>
      createPhotoUploads({ update_id: item.update_id, photos: batch.map((p) => ({ id: p.id, size: p.full.size, thumb_size: p.thumb.size })) }),
    );
    const urls = check(tickets);
    for (const photo of batch) {
      const t = urls.find((x) => x.id === photo.id)!;
      await uploadWithProgress(t.thumbUrl, photo.thumb, (n) => report(n));
      await uploadWithProgress(t.fullUrl, photo.full, (n) => report(photo.thumb.size + n));
      const reg = await call(() => registerPhotos({ update_id: item.update_id, photos: [{ id: photo.id, width: photo.width, height: photo.height, size: photo.full.size }] }));
      check(reg);
      photo.uploaded = true;
      doneBytes += photo.full.size + photo.thumb.size;
      photosDone += 1;
      await outbox.put(item);
      report();
    }
  }
}

let running: Promise<SyncResult> | null = null;

/** Sends everything waiting in the outbox. Only one sync runs at a time. */
export function syncOutbox(userId: string, onProgress: (p: SyncProgress) => void = () => {}): Promise<SyncResult> {
  running ??= (async () => {
    const result: SyncResult = { sent: [], failed: [], offline: false, signedOut: false };
    try {
      for (const item of await outbox.list(userId)) {
        if (item.status === "failed") continue;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          result.offline = true;
          break;
        }
        try {
          await sendItem(item, onProgress);
          await outbox.remove(item.client_ref);
          result.sent.push(item.client_ref);
        } catch (e) {
          const fresh = (await outbox.get(item.client_ref)) ?? item;
          fresh.attempts += 1;
          fresh.last_error = (e as Error).message;
          if (e instanceof NetworkError) {
            await outbox.put(fresh);
            if (e instanceof SignedOutError) result.signedOut = true;
            else result.offline = true;
            break; // stop for now; retry later
          }
          fresh.status = "failed";
          await outbox.put(fresh);
          result.failed.push({ ref: item.client_ref, error: fresh.last_error });
        }
      }
    } finally {
      running = null;
    }
    return result;
  })();
  return running;
}

/** Puts a failed item back in the queue (after the user taps "Try again"). */
export async function retryItem(ref: string) {
  const item = await outbox.get(ref);
  if (!item) return;
  item.status = "pending";
  item.last_error = undefined;
  await outbox.put(item);
}
