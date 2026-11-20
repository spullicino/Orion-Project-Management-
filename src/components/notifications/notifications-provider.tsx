"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadNotificationCount } from "@/app/(app)/notifications/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Ctx = { count: number; refresh: () => void };
const NotificationsContext = createContext<Ctx>({ count: 0, refresh: () => {} });
export const useNotifications = () => use(NotificationsContext);

/** Live unread-notification count, and a small pop-up when something new arrives. */
export function NotificationsProvider({ userId, initial, children }: { userId: string; initial: number; children: React.ReactNode }) {
  const [count, setCount] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await loadNotificationCount().catch(() => null);
      if (res?.ok) setCount(res.data ?? 0);
    }, 500);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const sub = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (p) => {
        const n = p.new as { title: string; body: string | null; link: string | null };
        // Don't pop up a notice about the chat you're already reading.
        if (!(n.link && window.location.pathname === n.link)) {
          toast(n.title, {
            description: n.body ?? undefined,
            action: n.link ? { label: "Open", onClick: () => router.push(n.link!) } : undefined,
          });
        }
        refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer.current);
      void supabase.removeChannel(sub);
    };
  }, [userId, refresh, router]);

  return <NotificationsContext value={{ count, refresh }}>{children}</NotificationsContext>;
}

export function NotificationBell({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const { count } = useNotifications();
  return (
    <Link
      href="/notifications"
      aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
      className={cn("relative flex items-center gap-3 rounded-lg", withLabel ? "h-11 px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground" : "size-11 justify-center", className)}
    >
      <span className="relative">
        <Bell className={withLabel ? "size-5" : "size-6"} aria-hidden />
        {count > 0 && (
          <span className="absolute -right-2 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-5 text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      {withLabel && "Notifications"}
    </Link>
  );
}
