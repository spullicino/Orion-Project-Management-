"use client";

import { CloudOff, Download, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "orion:install-dismissed";
const VISITS_KEY = "orion:visits";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function store<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Saves key pages for offline use right after signing in (once per session). */
export function OfflineWarmup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    if (store(() => sessionStorage.getItem("orion:warmed"), null)) return;
    const t = setTimeout(async () => {
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: "WARM", urls: ["/home", "/daily-update", "/my-tasks", "/projects", "/chats"] });
      store(() => sessionStorage.setItem("orion:warmed", "1"), undefined);
    }, 4000);
    return () => clearTimeout(t);
  }, []);
  return null;
}

/** Thin bar while the device has no connection. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-14 z-30 flex items-center justify-center gap-2 bg-foreground px-3 py-1.5 text-center text-xs font-medium text-background md:top-0">
      <CloudOff className="size-4 shrink-0" aria-hidden /> You&apos;re offline — showing saved pages. Daily updates will be sent when you&apos;re back online.
    </div>
  );
}

export function useInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<{ standalone: boolean; ios: boolean }>({ standalone: true, ios: false });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the device type once in the browser
    setState({ standalone: isStandalone(), ios: isIOS() });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setState((s) => ({ ...s, standalone: true }));
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === "accepted";
  };
  return { ...state, canPrompt: !!deferred, install };
}

export function IosInstallSteps() {
  return (
    <ol className="grid gap-2 text-sm">
      <li className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
        Tap <Share className="inline size-4 text-primary" aria-label="Share" /> <strong>Share</strong> at the bottom of Safari
      </li>
      <li className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
        Choose <SquarePlus className="inline size-4" aria-hidden /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>
      </li>
      <li className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
        Open Orion from your Home Screen
      </li>
    </ol>
  );
}

export function AndroidInstallSteps() {
  return (
    <ol className="grid gap-2 text-sm">
      <li>
        1. In Chrome, tap the <strong>⋮</strong> menu (top right)
      </li>
      <li>
        2. Choose <strong>Install app</strong> (or <strong>Add to Home screen</strong>)
      </li>
      <li>3. Open Orion from your home screen or app list</li>
    </ol>
  );
}

/** Friendly "Install this app" card for phones, shown from the second visit; can be dismissed for 2 weeks. */
export function InstallPrompt() {
  const { standalone, ios, canPrompt, install } = useInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (standalone) return;
    const visits = store(() => Number(localStorage.getItem(VISITS_KEY) ?? 0) + 1, 1);
    store(() => localStorage.setItem(VISITS_KEY, String(visits)), undefined);
    const dismissed = store(() => Number(localStorage.getItem(DISMISS_KEY) ?? 0), 0);
    const recentlyDismissed = Date.now() - dismissed < 14 * 86_400_000;
    const phone = window.matchMedia("(max-width: 767px)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decide once per visit
    if (!recentlyDismissed && visits >= 2 && (phone || canPrompt) && (ios || canPrompt)) setVisible(true);
  }, [standalone, ios, canPrompt]);

  if (!visible || standalone) return null;
  const dismiss = () => {
    store(() => localStorage.setItem(DISMISS_KEY, String(Date.now())), undefined);
    setVisible(false);
  };

  return (
    <div role="dialog" aria-label="Install Orion Projects" className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border bg-card p-4 shadow-xl md:inset-x-auto md:bottom-6 md:right-6 md:w-96">
      <button type="button" onClick={dismiss} className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent" aria-label="Not now">
        <X className="size-5" />
      </button>
      <div className="mb-3 flex items-center gap-3 pr-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-96.png" alt="" className="size-12 rounded-xl border" />
        <div>
          <p className="font-semibold">Install Orion Projects</p>
          <p className="text-sm text-muted-foreground">Opens full screen, works with poor signal, and can send you notifications.</p>
        </div>
      </div>
      {canPrompt ? (
        <Button className="w-full" onClick={async () => (await install()) && setVisible(false)}>
          <Download aria-hidden /> Install
        </Button>
      ) : ios ? (
        <IosInstallSteps />
      ) : (
        <AndroidInstallSteps />
      )}
    </div>
  );
}
