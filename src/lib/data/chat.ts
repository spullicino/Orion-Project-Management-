import { cache } from "react";
import "server-only";
import { dbError } from "@/lib/data/db-errors";
import { resolveAvatarUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { chatThumbPath, isImageAttachment, type ChannelSummary, type ChatMessage, type ChatPerson } from "@/types/chat";

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Adds signed URLs for attachments (and previews of images) and author avatars. */
export async function decorateMessages(supabase: Supa, messages: ChatMessage[]): Promise<ChatMessage[]> {
  if (!messages.length) return messages;
  const atts = messages.flatMap((m) => m.attachments);
  const paths = atts.flatMap((a) => (isImageAttachment(a) ? [a.storage_path, chatThumbPath(a.storage_path)] : [a.storage_path]));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("chat-files").createSignedUrls(paths, 60 * 60 * 2);
    data?.forEach((d) => d.path && d.signedUrl && urls.set(d.path, d.signedUrl));
  }
  const avatars = await resolveAvatarUrls(supabase, messages.map((m) => m.author?.avatar_url));
  return messages.map((m, i) => ({
    ...m,
    author_avatar_src: avatars[i],
    attachments: m.attachments.map((a) => ({
      ...a,
      url: urls.get(a.storage_path) ?? null,
      thumb_url: isImageAttachment(a) ? (urls.get(chatThumbPath(a.storage_path)) ?? null) : null,
    })),
  }));
}

export const listChannels = cache(async (): Promise<ChannelSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_channels");
  if (error) throw dbError("Could not load chats", error);
  return (data ?? []) as unknown as ChannelSummary[];
});

export async function getMessages(channelId: string, before?: string | null): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_channel_messages", { p_channel: channelId, p_before: before ?? null, p_limit: 40 });
  if (error) throw dbError("Could not load messages", error);
  return decorateMessages(supabase, (data ?? []) as unknown as ChatMessage[]);
}

export async function getChannelPeople(channelId: string): Promise<ChatPerson[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_channel_people", { p_channel: channelId });
  if (error) throw dbError("Could not load people", error);
  const people = (data ?? []) as unknown as ChatPerson[];
  const urls = await resolveAvatarUrls(supabase, people.map((p) => p.avatar_url));
  return people.map((p, i) => ({ ...p, avatar_src: urls[i] }));
}
