import { ChatShell } from "@/components/chat/chat-shell";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { listChannels } from "@/lib/data/chat";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";

export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  const me = await requireActiveProfile();
  let channels;
  try {
    channels = await listChannels();
  } catch (e) {
    if (e instanceof DatabaseUpdateNeeded) return <><PageHeader title="Chats" /><DatabaseUpdateNotice isAdmin={me.role === "admin"} /></>;
    throw e;
  }
  return (
    <ChatShell channels={channels} canCreate={hasRole(me.role, "manager")}>
      {children}
    </ChatShell>
  );
}
