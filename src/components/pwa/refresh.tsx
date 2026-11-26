"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

const MY_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
let updateReady = false;

/** Reload the page's data (or the whole app if a new version is waiting). */
function useRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const refresh = useCallback(() => {
    if (updateReady) return window.location.reload();
    window.dispatchEvent(new Event("orion:refresh"));
    start(() => router.refresh());
  }, [router]);
  return { refresh, pending };
}

/** ⟳ in the top bar (phones) or the left menu (computers). */
export function RefreshButton({ withLabel = false, className }: { withLabel?: boolean; className?: string }) {
  const { refresh, pending } = useRefresh();
  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      aria-label="Refresh"
      title="Refresh"
      className={cn(
        withLabel
          ? "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          : "flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <RefreshCw className={cn("size-5", pending && "animate-spin")} aria-hidden />
      {withLabel && <span className="flex-1 text-left">{pending ? "Refreshing…" : "Refresh"}</span>}
    </button>
  );
}

/**
 * Phones: drag down from the top of the page to refresh, like most apps.
 * Ignored inside pop-ups, panels and anything that scrolls on its own.
 */
export function PullToRefresh() {
  const { refresh, pending } = useRefresh();
  const [pull, setPull] = useState(0);
  const start = useRef<{ y: number; x: number } | null>(null);
  const THRESHOLD = 80;

  useEffect(() => {
    const scrolledInside = (el: EventTarget | null) => {
      for (let n = el instanceof Element ? (el as HTMLElement) : null; n && n !== document.body; n = n.parentElement) {
        // Pop-ups, the Gantt chart, and anything you drag (Board / Kanban handles).
        if (n.closest('[role="dialog"],[role="alertdialog"],[data-no-pull],[aria-roledescription]')) return true;
        const s = getComputedStyle(n);
        if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.scrollY > 0 || scrolledInside(e.target)) return void (start.current = null);
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX };
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dy <= 0 || dx > dy || window.scrollY > 0) return setPull(0);
      setPull(Math.min(dy * 0.5, THRESHOLD * 1.4));
    };
    const onEnd = () => {
      if (start.current && pull >= THRESHOLD) refresh();
      start.current = null;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pull, refresh]);

  const show = pull > 8 || pending;
  if (!show) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.75rem)] z-30 flex justify-center md:hidden" aria-hidden>
      <span
        className="flex size-10 items-center justify-center rounded-full border bg-card shadow-md"
        style={{ transform: `translateY(${pending ? 8 : pull * 0.4}px)`, opacity: pending ? 1 : Math.min(1, pull / THRESHOLD) }}
      >
        {pending ? <Loader2 className="size-5 animate-spin text-primary" /> : <RefreshCw className={cn("size-5 text-primary transition-transform", ready && "rotate-180")} style={{ transform: ready ? undefined : `rotate(${pull * 2}deg)` }} />}
      </span>
    </div>
  );
}

/** "A new version is ready — Update": checked when the app comes back to the front and every 15 minutes. */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (MY_BUILD === "dev") return;
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { build } = (await res.json()) as { build?: string };
        if (build && build !== MY_BUILD) {
          updateReady = true;
          setReady(true);
        }
      } catch {
        /* offline: try later */
      }
    };
    void check();
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void check(), 15 * 60 * 1000);
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);
  if (!ready) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border bg-card p-3 shadow-xl md:bottom-6">
      <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 text-sm font-medium">A new version of the app is ready.</span>
      <button type="button" onClick={() => window.location.reload()} className="h-11 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        Update
      </button>
    </div>
  );
}
