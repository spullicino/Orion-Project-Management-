"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/app/(app)/projects/actions";
import { hasRole } from "@/lib/auth/roles";
import { getCurrentProfile, requireActiveProfile, requireRole } from "@/lib/auth/session";
import { decorateMessages, getChannelPeople, getMessages, listChannels } from "@/lib/data/chat";
import { rateLimit } from "@/lib/rate-limit";
import { queuePush } from "@/lib/notify/queue";
import { createClient } from "@/lib/supabase/server";
import { chatThumbPath, type ChannelSummary, type ChatMessage, type ChatPerson } from "@/types/chat";

const uuid = z.string().uuid();
const fail = (error: string): Result<never> => ({ ok: false, error });
const friendly = (m: string) => (/row-level security|permission denied/i.test(m) ? "You can't post in this chat." : m);
const MAX_FILE = 25 * 1024 * 1024;

/** Background calls (badge, live updates, read status) must never redirect mid-conversation. */
async function quietUser() {
  const me = await getCurrentProfile();
  return me && me.status === "active" ? me : null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function loadChannels(): Promise<Result<ChannelSummary[]>> {
  if (!(await quietUser())) return fail("SIGNED_OUT");
  try {
    return { ok: true, data: await listChannels() };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function loadUnreadTotal(): Promise<Result<number>> {
  if (!(await quietUser())) return fail("SIGNED_OUT");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_unread_total");
  if (error) return fail(error.message);
  return { ok: true, data: Number(data ?? 0) };
}

export async function loadOlder(channelId: string, before: string): Promise<Result<ChatMessage[]>> {
  await requireActiveProfile();
  if (!uuid.safeParse(channelId).success) return fail("Invalid chat");
  try {
    return { ok: true, data: await getMessages(channelId, before) };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function loadSince(channelId: string, since: string): Promise<Result<ChatMessage[]>> {
  if (!(await quietUser())) return fail("SIGNED_OUT");
  if (!uuid.safeParse(channelId).success) return fail("Invalid chat");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_channel_messages_since", { p_channel: channelId, p_since: since });
  if (error) return fail(error.message);
  return { ok: true, data: await decorateMessages(supabase, (data ?? []) as unknown as ChatMessage[]) };
}

export async function loadMessage(id: string): Promise<Result<ChatMessage | null>> {
  if (!(await quietUser())) return fail("SIGNED_OUT");
  if (!uuid.safeParse(id).success) return fail("Invalid message");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_message", { p_message: id });
  if (error) return fail(error.message);
  if (!data) return { ok: true, data: null };
  const [m] = await decorateMessages(supabase, [data as unknown as ChatMessage]);
  return { ok: true, data: m };
}

export async function loadThread(parentId: string): Promise<Result<{ parent: ChatMessage; replies: ChatMessage[] }>> {
  await requireActiveProfile();
  if (!uuid.safeParse(parentId).success) return fail("Invalid message");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_thread", { p_parent: parentId });
  if (error) return fail(error.message);
  if (!data) return fail("This message is no longer available.");
  const t = data as unknown as { parent: ChatMessage; replies: ChatMessage[] };
  const [parent, ...replies] = await decorateMessages(supabase, [t.parent, ...t.replies]);
  return { ok: true, data: { parent, replies } };
}

export async function loadPeople(channelId: string): Promise<Result<ChatPerson[]>> {
  await requireActiveProfile();
  if (!uuid.safeParse(channelId).success) return fail("Invalid chat");
  try {
    return { ok: true, data: await getChannelPeople(channelId) };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Tasks that can be linked from a project chat. */
export async function loadLinkableTasks(projectId: string): Promise<Result<{ id: string; title: string; completed: boolean }[]>> {
  await requireActiveProfile();
  if (!uuid.safeParse(projectId).success) return fail("Invalid project");
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").select("id, title, completed_at").eq("project_id", projectId).order("position").limit(500);
  if (error) return fail(error.message);
  return { ok: true, data: (data ?? []).map((t) => ({ id: t.id, title: t.title, completed: !!t.completed_at })) };
}

export async function markRead(channelId: string): Promise<Result> {
  if (!(await quietUser())) return fail("SIGNED_OUT");
  if (!uuid.safeParse(channelId).success) return fail("Invalid chat");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_channel_read", { p_channel: channelId });
  if (error) return fail(error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

const attachmentSchema = z.object({
  id: uuid,
  kind: z.enum(["image", "file"]),
  file_name: z.string().min(1).max(255),
  mime_type: z.string().max(120),
  size_bytes: z.number().int().positive().max(MAX_FILE),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

const safeName = (n: string) => n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-100) || "file";
const attachmentPath = (channelId: string, messageId: string, a: { id: string; kind: "image" | "file"; file_name: string }) =>
  a.kind === "image" ? `${channelId}/${messageId}/${a.id}.jpg` : `${channelId}/${messageId}/${a.id}-${safeName(a.file_name)}`;

/** Step 1 (only when there are files): short-lived upload links. Images also get a preview upload link. */
export async function createChatUploads(input: { channel_id: string; message_id: string; files: z.infer<typeof attachmentSchema>[] }): Promise<
  Result<{ id: string; url: string; thumbUrl: string | null; path: string }[]>
> {
  const me = await requireActiveProfile();
  const parsed = z.object({ channel_id: uuid, message_id: uuid, files: z.array(attachmentSchema).min(1).max(10) }).safeParse(input);
  if (!parsed.success) return fail("Invalid files (max 10 files, 25 MB each).");
  for (let i = 0; i < parsed.data.files.length; i++) {
    if (!(await rateLimit("upload", me.id))) return fail("Too many uploads. Please wait a few minutes.");
  }
  const supabase = await createClient();
  const out: { id: string; url: string; thumbUrl: string | null; path: string }[] = [];
  for (const f of parsed.data.files) {
    const path = attachmentPath(parsed.data.channel_id, parsed.data.message_id, f);
    const main = await supabase.storage.from("chat-files").createSignedUploadUrl(path, { upsert: true });
    if (main.error || !main.data) return fail("You can't share files in this chat.");
    let thumbUrl: string | null = null;
    if (f.kind === "image") {
      const t = await supabase.storage.from("chat-files").createSignedUploadUrl(chatThumbPath(path), { upsert: true });
      thumbUrl = t.data?.signedUrl ?? null;
    }
    out.push({ id: f.id, url: main.data.signedUrl, thumbUrl, path });
  }
  return { ok: true, data: out };
}

const sendSchema = z.object({
  id: uuid,
  channel_id: uuid,
  body: z.string().max(8000),
  parent_id: uuid.nullable().optional(),
  task_id: uuid.nullable().optional(),
  mentions: z.array(uuid).max(50).default([]),
  attachments: z.array(attachmentSchema).max(10).default([]),
});

/** Step 2: the message itself, with its attachments, in one database transaction. */
export async function sendMessage(input: unknown): Promise<Result<ChatMessage>> {
  const me = await requireActiveProfile();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid message");
  const v = parsed.data;
  if (!v.body.trim() && !v.attachments.length) return fail("Write a message first.");
  if (!(await rateLimit("chatMessage", me.id))) return fail("You're sending messages very fast. Please wait a moment.");

  const supabase = await createClient();
  // Only keep @mentions of people who can actually read this chat.
  let mentions: string[] = [];
  if (v.mentions.length) {
    const { data: people } = await supabase.rpc("get_channel_people", { p_channel: v.channel_id });
    const allowed = new Set(((people ?? []) as unknown as ChatPerson[]).map((p) => p.user_id));
    mentions = [...new Set(v.mentions)].filter((id) => allowed.has(id));
  }

  const { data, error } = await supabase.rpc("send_chat_message", {
    p_id: v.id,
    p_channel: v.channel_id,
    p_body: v.body,
    p_parent: v.parent_id ?? null,
    p_task: v.task_id ?? null,
    p_mentions: mentions,
    p_attachments: v.attachments.map((a) => ({
      id: a.id,
      storage_path: attachmentPath(v.channel_id, v.id, a),
      file_name: a.file_name,
      mime_type: a.kind === "image" ? "image/jpeg" : a.mime_type || "application/octet-stream",
      size_bytes: a.size_bytes,
      width: a.width,
      height: a.height,
    })),
  });
  if (error) {
    if (/duplicate key/i.test(error.message)) {
      // Already sent (e.g. a retry after a dropped connection): return what's stored.
      const { data: again } = await supabase.rpc("get_message", { p_message: v.id });
      if (again) return { ok: true, data: (await decorateMessages(supabase, [again as unknown as ChatMessage]))[0] };
    }
    return fail(friendly(error.message));
  }
  const [msg] = await decorateMessages(supabase, [data as unknown as ChatMessage]);
  if (mentions.length) queuePush();
  return { ok: true, data: msg };
}

export async function editMessage(id: string, body: string): Promise<Result> {
  await requireActiveProfile();
  const parsed = z.object({ id: uuid, body: z.string().trim().min(1, "A message can't be empty").max(8000) }).safeParse({ id, body });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid message");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ body: parsed.data.body, edited_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("You can only edit your own messages.");
  return { ok: true };
}

/** Authors remove their own message (shown as "Message deleted"); admins remove any message completely. */
export async function deleteMessage(id: string): Promise<Result> {
  const me = await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid message");
  const supabase = await createClient();
  const { data: msg } = await supabase.from("messages").select("id, author_id").eq("id", id).maybeSingle();
  if (!msg) return fail("Message not found");
  const { data: atts } = await supabase.from("message_attachments").select("storage_path, width").eq("message_id", id);
  const paths = (atts ?? []).flatMap((a) => (a.width ? [a.storage_path, chatThumbPath(a.storage_path)] : [a.storage_path]));

  if (msg.author_id === me.id) {
    const { error } = await supabase.from("messages").update({ body: "", deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return fail(friendly(error.message));
    await supabase.from("message_attachments").delete().eq("message_id", id);
  } else if (hasRole(me.role, "admin")) {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) return fail(friendly(error.message));
  } else {
    return fail("You can only delete your own messages.");
  }
  if (paths.length) await supabase.storage.from("chat-files").remove(paths);
  return { ok: true };
}

const EMOJI = ["👍", "❤️", "😂", "😮", "🎉", "✅", "🙏", "👀"];

export async function toggleReaction(messageId: string, emoji: string): Promise<Result> {
  const me = await requireActiveProfile();
  if (!uuid.safeParse(messageId).success || !EMOJI.includes(emoji)) return fail("Invalid reaction");
  const supabase = await createClient();
  const { data: existing } = await supabase.from("message_reactions").select("emoji").eq("message_id", messageId).eq("user_id", me.id).eq("emoji", emoji).maybeSingle();
  const { error } = existing
    ? await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", me.id).eq("emoji", emoji)
    : await supabase.from("message_reactions").insert({ message_id: messageId, user_id: me.id, emoji });
  if (error) return fail(friendly(error.message));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export async function setMuted(channelId: string, muted: boolean): Promise<Result> {
  const me = await requireActiveProfile();
  if (!uuid.safeParse(channelId).success) return fail("Invalid chat");
  const supabase = await createClient();
  const { error } = await supabase.from("channel_members").upsert({ channel_id: channelId, user_id: me.id, muted }, { onConflict: "channel_id,user_id" });
  if (error) return fail(error.message);
  revalidatePath("/chats", "layout");
  return { ok: true, message: muted ? "Notifications muted for this chat" : "Notifications on" };
}

export async function createChannel(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireRole("manager");
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Give the chat a name").max(80),
      description: z.string().trim().max(500).optional().transform((v) => v || null),
      type: z.enum(["management", "general"]),
    })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form");
  const supabase = await createClient();
  const { data, error } = await supabase.from("channels").insert({ ...parsed.data, created_by: me.id }).select("id").single();
  if (error) return fail(friendly(error.message));
  revalidatePath("/chats", "layout");
  return { ok: true, data: { id: data.id }, message: "Chat created" };
}

export async function archiveChannel(channelId: string): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(channelId).success) return fail("Invalid chat");
  const supabase = await createClient();
  const { data, error } = await supabase.from("channels").update({ archived: true }).eq("id", channelId).neq("type", "project").select("id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("Project chats are archived together with their project.");
  revalidatePath("/chats", "layout");
  return { ok: true, message: "Chat archived" };
}
