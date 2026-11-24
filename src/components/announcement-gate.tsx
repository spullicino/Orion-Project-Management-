"use client";

import { Check, Loader2, Megaphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadMyUnreadAnnouncements, markAnnouncementRead, type UnreadAnnouncement } from "@/lib/announcements/actions";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));

/**
 * Important messages from an administrator cover the whole screen until the
 * person taps "I've read this". Checked when the app opens, when it comes back
 * to the front, and every 2 minutes while it's open.
 */
export function AnnouncementGate() {
  const [queue, setQueue] = useState<UnreadAnnouncement[]>([]);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    const list = await loadMyUnreadAnnouncements();
    setQueue(list);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads messages from the server when the app opens
    void check();
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void check(), 2 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [check]);

  const current = queue[0];
  if (!current) return null;

  return (
    <AnnouncementScreen
      message={current}
      count={queue.length}
      busy={busy}
      onRead={async () => {
        setBusy(true);
        const ok = await markAnnouncementRead(current.id);
        setBusy(false);
        if (!ok) return void toast.error("Couldn't confirm — check your signal and try again.");
        setQueue((q) => q.slice(1));
      }}
    />
  );
}

/** The full-screen message itself. */
export function AnnouncementScreen({ message: current, count, busy, onRead }: { message: UnreadAnnouncement; count: number; busy: boolean; onRead: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" role="alertdialog" aria-modal="true" aria-labelledby="announcement-title" aria-describedby="announcement-body">
      <div className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:max-h-[85dvh] sm:rounded-3xl">
        <div className="flex items-center gap-3 bg-destructive px-5 py-4 pt-[max(env(safe-area-inset-top),1rem)] text-white sm:pt-4">
          <Megaphone className="size-6 shrink-0" aria-hidden />
          <span className="flex-1 text-sm font-bold uppercase tracking-wide">Important message</span>
          {count > 1 && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">1 of {count}</span>}
        </div>
        <div className="grid min-h-0 gap-3 overflow-y-auto px-5 py-5">
          <h2 id="announcement-title" className="text-xl font-bold leading-snug">
            {current.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            From {current.sender} · {when(current.created_at)}
          </p>
          <p id="announcement-body" className="whitespace-pre-wrap break-words text-base leading-relaxed">
            {current.body}
          </p>
        </div>
        <div className="border-t p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Button
            key={current.id}
            autoFocus
            size="lg"
            className="h-12 w-full text-base"
            disabled={busy}
            onClick={onRead}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} I&apos;ve read this
          </Button>
        </div>
      </div>
    </div>
  );
}
