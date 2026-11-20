"use client";

import { createContext, use, useCallback, useEffect, useRef, useState } from "react";
import { loadUnreadTotal } from "@/app/(app)/chats/actions";
import { createClient } from "@/lib/supabase/client";

type Ctx = { unread: number; refresh: () => void };
const UnreadContext = createContext<Ctx>({ unread: 0, refresh: () => {} });
export const useUnread = () => use(UnreadContext);

/** Keeps the unread-messages badge up to date (live, via Supabase Realtime). */
export function UnreadProvider({ initial, children }: { initial: number; children: React.ReactNode }) {
  const [unread, setUnread] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await loadUnreadTotal().catch(() => null);
      if (res?.ok) setUnread(res.data ?? 0);
    }, 800);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    // RLS means we only hear about messages in chats we can read.
    const channel = supabase
      .channel("unread-badge")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Show the count on the installed app's icon where supported (Android/desktop PWA).
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread > 0) void nav.setAppBadge?.(unread).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  return <UnreadContext value={{ unread, refresh }}>{children}</UnreadContext>;
}

export function UnreadBadge({ className = "" }: { className?: string }) {
  const { unread } = useUnread();
  if (!unread) return null;
  return (
    <span className={`inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-5 text-white ${className}`} aria-label={`${unread} unread messages`}>
      {unread > 99 ? "99+" : unread}
    </span>
  );
}
