"use client";

import {
  CloudOff,
  Loader2,
  RotateCcw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { ProgressBar } from "@/components/ui/progress";
import { onOutboxChange, outbox, type OutboxItem } from "@/lib/offline/outbox";
import { retryItem, syncOutbox, type SyncProgress } from "@/lib/offline/sync";
import { formatDate } from "@/lib/utils";

type Ctx = {
  items: OutboxItem[];
  progress: Record<string, SyncProgress>;
  syncing: boolean;
  online: boolean;
  /** Saves an update on this phone and starts sending it. */
  enqueue: (
    item: Omit<OutboxItem, "user_id" | "created_at" | "attempts" | "status">,
  ) => Promise<void>;
  syncNow: () => Promise<void>;
};

const OutboxContext = createContext<Ctx | null>(null);
export function useOutbox() {
  const ctx = use(OutboxContext);
  if (!ctx) throw new Error("useOutbox must be used inside <OutboxProvider>");
  return ctx;
}

export function OutboxProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [progress, setProgress] = useState<Record<string, SyncProgress>>({});
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const router = useRouter();
  const userRef = useRef(userId);

  const reload = useCallback(async () => {
    try {
      setItems(await outbox.list(userRef.current));
    } catch {
      // IndexedDB unavailable (e.g. some private browsing modes): nothing queued.
    }
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await syncOutbox(userRef.current, (p) =>
        setProgress((all) => ({ ...all, [p.ref]: p })),
      );
      if (res.sent.length) {
        toast.success(
          res.sent.length === 1
            ? "Daily update sent"
            : `${res.sent.length} daily updates sent`,
        );
        router.refresh();
      }
      for (const f of res.failed)
        toast.error(`An update couldn't be sent: ${f.error}`);
    } catch {
      // Storage not available — ignore; the form shows its own error.
    } finally {
      setSyncing(false);
      setProgress({});
      await reload();
    }
  }, [reload, router]);

  const enqueue: Ctx["enqueue"] = useCallback(
    async (item) => {
      await outbox.put({
        ...item,
        user_id: userRef.current,
        created_at: Date.now(),
        attempts: 0,
        status: "pending",
      });
      await reload();
      if (!navigator.onLine) {
        toast.info(
          "You're offline. The update is saved on this phone and will be sent automatically.",
        );
        return;
      }
      void syncNow();
    },
    [reload, syncNow],
  );

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial online state comes from the browser
    setOnline(navigator.onLine);
    const off = onOutboxChange(() => void reload());
    const goOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () =>
      document.visibilityState === "visible" &&
      navigator.onLine &&
      void syncNow();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    // Try once on start, then every minute while something is waiting.
    void syncNow();
    const timer = setInterval(() => {
      if (navigator.onLine)
        void outbox
          .list(userRef.current)
          .then((l) => {
          if (l.some((i) => i.status === "pending")) void syncNow();
        });
    }, 60_000);
    return () => {
      off();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [reload, syncNow]);

  return (
    <OutboxContext
      value={{ items, progress, syncing, online, enqueue, syncNow }}
    >
      {children}
    </OutboxContext>
  );
}

/** Shows updates that are saved on this phone but not sent yet. */
export function OutboxPanel({ compact = false }: { compact?: boolean }) {
  const { items, progress, syncing, online, syncNow } = useOutbox();
  const { confirm, dialog } = useConfirm();
  if (!items.length) return null;

  if (compact) {
    const sending = items.filter((i) => i.status === "pending").length;
    const failed = items.length - sending;
    return (
      <a
        href="/daily-update"
        className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      >
        {online ? (
          <UploadCloud
            className="size-5 text-amber-700 dark:text-amber-400"
            aria-hidden
          />
        ) : (
          <CloudOff
            className="size-5 text-amber-700 dark:text-amber-400"
            aria-hidden
          />
        )}
        <span className="flex-1">
          {sending > 0 &&
            `${sending} daily ${sending === 1 ? "update" : "updates"} waiting to send${online ? "" : " (offline)"}. `}
          {failed > 0 && `${failed} couldn't be sent — tap to fix.`}
        </span>
      </a>
    );
  }

  return (
    <section
      aria-label="Waiting to send"
      className="mb-5 grid gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
    >
      <div className="flex items-center gap-2">
        {online ? (
          <UploadCloud
            className="size-5 text-amber-700 dark:text-amber-400"
            aria-hidden
          />
        ) : (
          <CloudOff
            className="size-5 text-amber-700 dark:text-amber-400"
            aria-hidden
          />
        )}
        <h2 className="flex-1 font-semibold">
          {online
            ? "Sending from this phone"
            : "Saved on this phone — you're offline"}
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={syncing || !online}
          onClick={() => void syncNow()}
        >
          {syncing ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <RotateCcw aria-hidden />
          )}{" "}
          Send now
        </Button>
      </div>
      <ul className="grid gap-2">
        {items.map((i) => {
          const p = progress[i.client_ref];
          const pct = p ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <li key={i.client_ref} className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {i.project_name} · {formatDate(i.work_date)}
                </span>
                {i.status === "failed" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await retryItem(i.client_ref);
                        void syncNow();
                      }}
                    >
                      Try again
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete this unsent update"
                      onClick={async () => {
                        if (
                          await confirm("Delete this unsent update?", {
                            body: "It hasn't been sent, so it will be lost.",
                          })
                        )
                          await outbox.remove(i.client_ref);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {p
                      ? `${pct}%`
                      : online
                        ? "Waiting…"
                        : "Will send when online"}
                  </span>
                )}
              </div>
              {p && <ProgressBar value={pct} className="mt-2" />}
              {p && p.photosTotal > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Photos {p.photosDone} of {p.photosTotal}
                </p>
              )}
              {i.status === "failed" && i.last_error && (
                <p className="mt-1 text-xs text-destructive">{i.last_error}</p>
              )}
              {i.status === "pending" && i.attempts > 0 && !p && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Will retry automatically ({i.attempts} tries so far).
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {dialog}
    </section>
  );
}
