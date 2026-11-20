"use client";

import { useEffect } from "react";

/** Registers the service worker (offline pages, push). Production builds only. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("service worker", e));
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

/** Wipes this person's saved pages and photos from the device (used on sign-out). */
export async function clearOfflineData() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_USER_DATA" });
    if ("caches" in window) {
      for (const key of await caches.keys()) if (key.startsWith("orion-pages") || key.startsWith("orion-images")) await caches.delete(key);
    }
  } catch {
    // nothing saved
  }
}
