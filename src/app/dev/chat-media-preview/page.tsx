"use client";

import { notFound } from "next/navigation";
import { ChatMedia } from "@/components/chat/chat-media";
import { previewMessages } from "@/dev/chat-fixtures";
import type { ChatMediaItem } from "@/types/chat";

/** Development-only preview of a chat's "Photos & files" panel. */
export default function ChatMediaPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const items: ChatMediaItem[] = previewMessages.flatMap((m) =>
    m.attachments.map((a) => ({ ...a, message_id: m.id, parent_id: null, created_at: m.created_at, author: m.author })),
  );
  const loader = async (_: string, kind: "photos" | "files") => ({
    ok: true as const,
    data: items.filter((a) => (kind === "photos") === (a.mime_type === "image/jpeg" && a.width !== null)),
  });
  return <ChatMedia channelId="c1" open onClose={() => {}} onGoToMessage={() => alert("go")} loader={loader} />;
}
