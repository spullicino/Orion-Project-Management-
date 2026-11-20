import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chats" };

/** On computers this fills the space beside the list; on phones the list is shown instead. */
export default function ChatsIndex() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <MessagesSquare className="size-12" aria-hidden />
      <p>Choose a chat on the left.</p>
    </div>
  );
}
