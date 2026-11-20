"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Daily updates waiting to be sent, stored on the phone (IndexedDB) so nothing
 * is lost on a bad connection or if the app is closed. Photos are stored as
 * already-compressed Blobs.
 */
export type OutboxPhoto = { id: string; full: Blob; thumb: Blob; width: number; height: number; uploaded: boolean };
export type OutboxItem = {
  client_ref: string;
  user_id: string;
  project_id: string;
  project_name: string;
  work_date: string;
  work_done: string;
  hours: number | null;
  issues: string | null;
  photos: OutboxPhoto[];
  update_id?: string;
  created_at: number;
  attempts: number;
  /** "failed" = the server refused it (needs the user); otherwise it retries automatically. */
  status: "pending" | "failed";
  last_error?: string;
};

interface OutboxDB extends DBSchema {
  daily: { key: string; value: OutboxItem; indexes: { by_user: string } };
}

let dbPromise: Promise<IDBPDatabase<OutboxDB>> | null = null;
function db() {
  dbPromise ??= openDB<OutboxDB>("orion-offline", 1, {
    upgrade(d) {
      const store = d.createObjectStore("daily", { keyPath: "client_ref" });
      store.createIndex("by_user", "user_id");
    },
  });
  return dbPromise;
}

export const outbox = {
  async put(item: OutboxItem) {
    await (await db()).put("daily", item);
    notify();
  },
  async list(userId: string): Promise<OutboxItem[]> {
    const items = await (await db()).getAllFromIndex("daily", "by_user", userId);
    return items.sort((a, b) => a.created_at - b.created_at);
  },
  async get(ref: string) {
    return (await db()).get("daily", ref);
  },
  async remove(ref: string) {
    await (await db()).delete("daily", ref);
    notify();
  },
};

// Lets every open screen (form, banner) know the outbox changed.
const listeners = new Set<() => void>();
export function onOutboxChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => fn());
}
