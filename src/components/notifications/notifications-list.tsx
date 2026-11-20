"use client";

import { AtSign, Bell, NotebookTabs, CalendarClock, CheckCheck, ClipboardPenLine, Loader2, MessageSquare, RefreshCw, UserPlus, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { loadNotifications, markNotificationsRead, type Notification } from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import { listTime } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { useNotifications } from "./notifications-provider";

const ICONS: Record<string, typeof Bell> = {
  "task.assigned": UserPlus,
  "task.status": RefreshCw,
  "task.comment": MessageSquare,
  "task.due_soon": CalendarClock,
  "task.overdue": AlertTriangle,
  mention: AtSign,
  "daily.new": ClipboardPenLine,
  "personal.due": NotebookTabs,
};

export function NotificationsList({ initial }: { initial: Notification[] }) {
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length >= 40);
  const [pending, start] = useTransition();
  const { refresh } = useNotifications();
  const router = useRouter();
  const unread = items.filter((n) => !n.read_at).length;

  const open = async (n: Notification) => {
    if (!n.read_at) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await markNotificationsRead([n.id]);
      refresh();
    }
    if (n.link) router.push(n.link);
  };

  return (
    <div className="grid content-start gap-3">
      {unread > 0 && (
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() =>
            start(async () => {
              const res = await markNotificationsRead("all");
              if (!res.ok) return void toast.error(res.error);
              setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
              refresh();
            })
          }
        >
          <CheckCheck aria-hidden /> Mark all as read
        </Button>
      )}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">You&apos;re all caught up. 🎉</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <button type="button" onClick={() => open(n)} className={cn("flex w-full gap-3 p-4 text-left hover:bg-accent/50", !n.read_at && "bg-primary/5")}>
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", n.type === "task.overdue" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block", !n.read_at ? "font-semibold" : "font-medium")}>{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-muted-foreground">{listTime(n.created_at)}</span>
                  </span>
                  {!n.read_at && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <Button
          variant="outline"
          className="justify-self-center"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await loadNotifications(items[items.length - 1]?.created_at);
              if (!res.ok) return void toast.error(res.error);
              setItems((xs) => [...xs, ...(res.data ?? [])]);
              setHasMore((res.data?.length ?? 0) >= 40);
            })
          }
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />} Show older
        </Button>
      )}
    </div>
  );
}
