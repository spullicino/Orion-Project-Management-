"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadChannels } from "@/app/(app)/chats/actions";
import { cn } from "@/lib/utils";
import type { ChannelSummary } from "@/types/chat";
import { ChannelList } from "./channel-list";
import { useUnread } from "./unread-provider";

/** Chat list beside the conversation on computers; list or conversation on phones. */
export function ChatShell({ channels: initial, canCreate, children }: { channels: ChannelSummary[]; canCreate: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/chats/") ? pathname.split("/")[2] : null;
  const [channels, setChannels] = useState(initial);
  const { unread } = useUnread();
  const first = useRef(true);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- new server data replaces the list
  useEffect(() => setChannels(initial), [initial]);

  // Refresh previews and counts whenever the unread total changes (new message, or one was read).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void loadChannels().then((r) => r.ok && setChannels(r.data ?? []));
  }, [unread, activeId]);

  return (
    <div className="md:grid md:h-[calc(100dvh-4.5rem)] md:grid-cols-[320px_minmax(0,1fr)] md:overflow-hidden md:rounded-xl md:border md:bg-card">
      <aside className={cn("min-w-0 md:overflow-y-auto md:border-r md:p-2", activeId && "hidden md:block")}>
        <h1 className="mb-4 px-2 text-2xl font-bold md:hidden">Chats</h1>
        <ChannelList channels={channels} activeId={activeId} canCreate={canCreate} />
      </aside>
      <section className={cn("min-h-0 md:flex md:flex-col", !activeId && "hidden md:flex")}>{children}</section>
    </div>
  );
}
