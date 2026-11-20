import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Conversation } from "@/components/chat/conversation";
import { hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { getChannelPeople, getMessages, listChannels } from "@/lib/data/chat";
import { resolveAvatarUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ channelId: string }> }): Promise<Metadata> {
  const { channelId } = await params;
  const channel = (await listChannels().catch(() => [])).find((c) => c.id === channelId);
  return { title: channel ? `${channel.name} · Chat` : "Chat" };
}

export default async function ChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(channelId)) notFound();
  const me = await requireActiveProfile();
  const channel = (await listChannels()).find((c) => c.id === channelId);
  if (!channel) notFound();
  const [messages, people, [avatar]] = await Promise.all([
    getMessages(channelId),
    getChannelPeople(channelId),
    resolveAvatarUrls(await createClient(), [me.avatar_url]),
  ]);
  return (
    <Conversation
      key={channelId}
      channel={channel}
      initial={messages}
      people={people}
      me={{
        id: me.id,
        first_name: me.first_name,
        last_name: me.last_name,
        email: me.email,
        avatar_src: avatar,
        isAdmin: hasRole(me.role, "admin"),
        isManager: hasRole(me.role, "manager"),
      }}
    />
  );
}
