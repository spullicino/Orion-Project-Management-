"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { removePushSubscription, savePushSubscription } from "@/app/(app)/notifications/actions";

export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on" | "checking";
export type PushStep = "permission" | "worker" | "subscribe" | "save";
export type PushProblem = { step: PushStep; message: string; detail: string };

class TimeoutError extends Error {
  name = "TimeoutError";
}
/** Never wait forever: some phones leave these steps hanging without an answer. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`no answer after ${ms / 1000}s`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** What to tell the person when a step fails — plain steps they can follow. */
const STEP_ADVICE: Record<PushStep, (e: Error) => string> = {
  permission: () =>
    "The phone didn't ask for permission. On Android, look for a small bell 🔔 in the address bar and tap Allow — or open your phone's Settings → Apps → Chrome → Notifications and switch them on. Then tap “Turn on notifications” again.",
  worker: () => "The app's background helper didn't start. Close the app completely (swipe it away), open it again and tap “Turn on notifications” again.",
  subscribe: (e) =>
    /permission/i.test(e.message)
      ? "Notifications are blocked for this app. Open your phone's Settings → Apps → Chrome (or Orion Projects) → Notifications, allow them, then try again."
      : "This phone couldn't reach its notification service. Turn off any VPN or data saver, make sure Chrome and Google Play services are up to date, then try again. (Phones without Google services, e.g. some Huawei models, can't get notifications.)",
  save: () => "Couldn't save — check your signal and try again.",
};

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function getRegistration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
}

/** Whether this phone/computer gets notifications, and buttons to switch them on or off. */
export function usePushDevice({ onEnabled }: { onEnabled?: () => void } = {}) {
  const [push, setPush] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<PushProblem | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setPush(ios && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setPush("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    })().catch(() => setPush("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setProblem(null);
    let step: PushStep = "permission";
    try {
      // 1. Ask permission. On Android, Chrome sometimes shows this only as a small bell in the
      //    address bar, so the question can wait forever — give up after 30 s with advice.
      const permission = Notification.permission === "granted" ? "granted" : await withTimeout(Notification.requestPermission(), 30_000);
      if (permission !== "granted") {
        setPush(permission === "denied" ? "denied" : "off");
        return void toast.error("Notifications were not allowed.");
      }
      // 2. The app's background helper (service worker) must be running.
      step = "worker";
      const reg = await withTimeout(getRegistration(), 15_000);
      if (!reg.active) {
        await withTimeout(navigator.serviceWorker.ready, 15_000).catch(async () => {
          await reg.update().catch(() => {});
          return withTimeout(navigator.serviceWorker.ready, 10_000);
        });
      }
      // 3. Sign this phone up with its notification service (Google on Android, Apple on iPhone).
      step = "subscribe";
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Notifications aren't set up for this app yet.");
      const subscribe = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      let sub: PushSubscription;
      try {
        sub = await withTimeout(subscribe(), 20_000);
      } catch (e) {
        // A sign-up left over from older app keys blocks a new one: remove it and try once more.
        const old = await reg.pushManager.getSubscription().catch(() => null);
        if (!old || (e as Error).name === "TimeoutError") throw e;
        await old.unsubscribe().catch(() => {});
        sub = await withTimeout(subscribe(), 20_000);
      }
      // 4. Save it so the server can send to this phone.
      step = "save";
      const res = await withTimeout(savePushSubscription(sub.toJSON(), navigator.userAgent), 20_000);
      if (!res.ok) throw new Error(res.error);
      setPush("on");
      onEnabled?.();
      toast.success("Notifications are on for this device");
    } catch (e) {
      const err = e as Error;
      const p = { step, message: STEP_ADVICE[step](err), detail: `${step} · ${err.name}: ${err.message}`.slice(0, 200) };
      setProblem(p);
      toast.error("Couldn't turn on notifications — see the note under the button.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setPush("off");
      toast.success("Notifications are off for this device");
    } finally {
      setBusy(false);
    }
  }

  return { push, busy, enable, disable, problem };
}
