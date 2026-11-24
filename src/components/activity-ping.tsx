"use client";

import { useEffect } from "react";
import { touchLastSeen } from "@/lib/activity/actions";

const KEY = "orion-last-seen-ping";
const EVERY = 5 * 60 * 1000;

/** Tells the server "I'm using the app" when it's opened or brought back, at most every 5 minutes. */
export function ActivityPing() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      let last = 0;
      try {
        last = Number(localStorage.getItem(KEY) ?? 0);
      } catch {}
      if (Date.now() - last < EVERY) return;
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {}
      void touchLastSeen();
    };
    ping();
    document.addEventListener("visibilitychange", ping);
    return () => document.removeEventListener("visibilitychange", ping);
  }, []);
  return null;
}
