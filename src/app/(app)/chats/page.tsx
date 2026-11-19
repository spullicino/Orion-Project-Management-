import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Chats" };

export default function ChatsPage() {
  return (
    <>
      <PageHeader title="Chats" />
      <ComingSoon icon={MessagesSquare} title="Project, management and company chats" phase={5}>
        Real-time chat per project, with photos, @mentions, reactions and replies.
      </ComingSoon>
    </>
  );
}
