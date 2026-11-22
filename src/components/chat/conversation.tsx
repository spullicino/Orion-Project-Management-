"use client";

import { ChatMedia } from "./chat-media";
import { Lightbox, type LightboxPhoto } from "@/components/diary/lightbox";

import { ArrowDown, ArrowLeft, Bell, BellOff, FolderOpen, Loader2, MoreVertical, Archive, Users, Images } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  archiveChannel,
  createChatUploads,
  deleteMessage,
  editMessage,
  loadMessage,
  loadOlder,
  loadSince,
  loadThread,
  markRead,
  sendMessage,
  setMuted,
  toggleReaction,
} from "@/app/(app)/chats/actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { buildList, mergeMessages, personName } from "@/lib/chat";
import { uploadWithProgress } from "@/lib/offline/upload";
import { createClient } from "@/lib/supabase/client";
import type { ChannelSummary, ChatMessage, ChatPerson } from "@/types/chat";
import { Composer, type Draft } from "./composer";
import { MessageItem, type MessageActions } from "./message-item";
import { useUnread } from "./unread-provider";

type Me = { id: string; first_name: string; last_name: string; email: string; avatar_src: string | null; isAdmin: boolean; isManager: boolean };

/** Uploads any files, then sends the message (with its attachments) in one go. */
async function deliver(channelId: string, id: string, draft: Draft, parentId: string | null): Promise<ChatMessage> {
  if (draft.files.length) {
    const tickets = await createChatUploads({
      channel_id: channelId,
      message_id: id,
      files: draft.files.map((f) => ({ id: f.id, kind: f.kind, file_name: f.name, mime_type: f.mime, size_bytes: f.blob.size, width: f.width, height: f.height })),
    });
    if (!tickets.ok) throw new Error(tickets.error);
    for (const f of draft.files) {
      const t = tickets.data!.find((x) => x.id === f.id)!;
      if (f.thumb && t.thumbUrl) await uploadWithProgress(t.thumbUrl, f.thumb, undefined, "image/jpeg");
      await uploadWithProgress(t.url, f.blob, undefined, f.kind === "image" ? "image/jpeg" : f.mime);
    }
  }
  const res = await sendMessage({
    id,
    channel_id: channelId,
    body: draft.body,
    parent_id: parentId,
    task_id: draft.task?.id ?? null,
    mentions: draft.mentions,
    attachments: draft.files.map((f) => ({ id: f.id, kind: f.kind, file_name: f.name, mime_type: f.mime, size_bytes: f.blob.size, width: f.width, height: f.height })),
  });
  if (!res.ok) throw new Error(res.error);
  return res.data!;
}

function optimistic(channelId: string, id: string, draft: Draft, parentId: string | null, me: Me, projectId: string | null): ChatMessage {
  return {
    id,
    channel_id: channelId,
    author_id: me.id,
    parent_id: parentId,
    body: draft.body,
    mentions: draft.mentions,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted: false,
    author: { first_name: me.first_name, last_name: me.last_name, email: me.email, avatar_url: null },
    author_avatar_src: me.avatar_src,
    attachments: draft.files.map((f) => ({
      id: f.id,
      storage_path: "",
      file_name: f.name,
      mime_type: f.kind === "image" ? "image/jpeg" : f.mime,
      size_bytes: f.blob.size,
      width: f.width,
      height: f.height,
      url: f.previewUrl ?? null,
      thumb_url: f.previewUrl ?? null,
    })),
    reactions: [],
    reply_count: 0,
    last_reply_at: null,
    task: draft.task ? { id: draft.task.id, title: draft.task.title, project_id: projectId ?? "", completed: false } : null,
    pending: true,
  };
}

function MessageList({
  messages,
  me,
  canPost,
  people,
  actions,
  inThread,
}: {
  messages: ChatMessage[];
  me: Me;
  canPost: boolean;
  people: ChatPerson[];
  actions: MessageActions;
  inThread?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const items = useMemo(() => buildList(messages), [messages]);
  return (
    <>
      {items.map((it) =>
        it.kind === "day" ? (
          <div key={it.key} className="my-3 flex items-center gap-3 text-xs font-semibold text-muted-foreground" role="separator">
            <span className="h-px flex-1 bg-border" />
            {it.label}
            <span className="h-px flex-1 bg-border" />
          </div>
        ) : (
          <MessageItem
            key={it.key}
            m={it.message}
            showHeader={it.showHeader}
            meId={me.id}
            isAdmin={me.isAdmin}
            canPost={canPost}
            people={people}
            selected={selected === it.message.id}
            onSelect={setSelected}
            actions={actions}
            inThread={inThread}
          />
        ),
      )}
    </>
  );
}

export function Conversation({ channel, initial, people, me }: { channel: ChannelSummary; initial: ChatMessage[]; people: ChatPerson[]; me: Me }) {
  const [messages, setMessages] = useState(initial);
  const [hasOlder, setHasOlder] = useState(initial.length >= 40);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [muted, setMutedState] = useState(channel.muted);
  const [newBelow, setNewBelow] = useState(0);
  const [thread, setThread] = useState<{ parent: ChatMessage; replies: ChatMessage[] } | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [viewer, setViewer] = useState<{ photos: LightboxPhoto[]; index: number } | null>(null);
  const threadRef = useRef<string | null>(null);
  const drafts = useRef(new Map<string, { draft: Draft; parentId: string | null }>());
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const { refresh: refreshUnread } = useUnread();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  const scrollToBottom = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewBelow(0);
  };

  // Open at the newest message.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Mark as read on open, and whenever new messages arrive while the chat is on screen.
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const markAsRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(async () => {
      if (document.visibilityState !== "visible") return;
      await markRead(channel.id);
      refreshUnread();
    }, 700);
  }, [channel.id, refreshUnread]);
  // Opening the chat clears its notifications from the phone (like a messaging app).
  useEffect(() => {
    const clear = () =>
      navigator.serviceWorker
        ?.getRegistration("/")
        .then((r) => r?.getNotifications({ tag: `chat-${channel.id}` }))
        .then((list) => list?.forEach((n) => n.close()))
        .catch(() => {});
    clear();
    const onVisible = () => document.visibilityState === "visible" && clear();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [channel.id]);

  useEffect(() => {
    markAsRead();
    const onVisible = () => document.visibilityState === "visible" && markAsRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markAsRead]);

  // ---------------------------------------------------------------- live updates
  const latest = useRef(initial[initial.length - 1]?.created_at ?? new Date(0).toISOString());
  useEffect(() => {
    latest.current = messages.filter((m) => !m.pending).reduce((a, m) => (m.created_at > a ? m.created_at : a), latest.current);
  }, [messages]);

  const reloadThread = useCallback(async (parentId: string) => {
    const res = await loadThread(parentId);
    if (res.ok && threadRef.current === parentId) setThread(res.data!);
  }, []);

  const replaceMessage = useCallback(async (id: string) => {
    const res = await loadMessage(id);
    if (!res.ok) return;
    const m = res.data;
    if (!m) {
      setMessages((ms) => ms.filter((x) => x.id !== id));
      return;
    }
    if (m.parent_id) {
      if (threadRef.current === m.parent_id) setThread((t) => (t ? { ...t, replies: mergeMessages(t.replies, [m]) } : t));
    } else {
      setMessages((ms) => (ms.some((x) => x.id === id) ? ms.map((x) => (x.id === id ? m : x)) : ms));
      if (threadRef.current === m.id) setThread((t) => (t ? { ...t, parent: m } : t));
    }
  }, []);

  const catchUp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fetchNew = useCallback(() => {
    clearTimeout(catchUp.current);
    catchUp.current = setTimeout(async () => {
      const res = await loadSince(channel.id, latest.current);
      if (!res.ok || !res.data?.length) return;
      const top = res.data.filter((m) => !m.parent_id);
      const replies = res.data.filter((m) => m.parent_id);
      if (top.length) {
        const fromOthers = top.some((m) => m.author_id !== me.id);
        setMessages((ms) => mergeMessages(ms, top));
        if (atBottom.current) requestAnimationFrame(() => scrollToBottom(true));
        else if (fromOthers) setNewBelow((n) => n + top.filter((m) => m.author_id !== me.id).length);
        if (fromOthers) markAsRead();
      }
      for (const parentId of new Set(replies.map((r) => r.parent_id!))) {
        void replaceMessage(parentId); // reply count
        if (threadRef.current === parentId) void reloadThread(parentId);
      }
    }, 250);
  }, [channel.id, me.id, markAsRead, replaceMessage, reloadThread]);

  useEffect(() => {
    const supabase = createClient();
    const sub = supabase
      .channel(`chat:${channel.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` }, fetchNew)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` }, (p) => void replaceMessage((p.new as { id: string }).id))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` }, (p) => {
        const id = (p.old as { id: string }).id;
        setMessages((ms) => ms.filter((m) => m.id !== id));
        setThread((t) => (t ? { ...t, replies: t.replies.filter((r) => r.id !== id) } : t));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (p) => {
        const id = ((p.new as { message_id?: string })?.message_id ?? (p.old as { message_id?: string })?.message_id) as string | undefined;
        if (id) void replaceMessage(id);
      })
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && fetchNew();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", fetchNew);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", fetchNew);
      void supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once per chat
  }, [channel.id]);

  // ---------------------------------------------------------------- sending
  const send = useCallback(
    async (draft: Draft, parentId: string | null, existingId?: string) => {
      const id = existingId ?? crypto.randomUUID();
      drafts.current.set(id, { draft, parentId });
      const temp = optimistic(channel.id, id, draft, parentId, me, channel.project_id);
      if (parentId) setThread((t) => (t ? { ...t, replies: mergeMessages(t.replies, [temp]) } : t));
      else {
        setMessages((ms) => mergeMessages(ms, [temp]));
        requestAnimationFrame(() => scrollToBottom(true));
      }
      try {
        const saved = await deliver(channel.id, id, draft, parentId);
        drafts.current.delete(id);
        draft.files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
        if (parentId) {
          setThread((t) => (t ? { ...t, replies: mergeMessages(t.replies, [saved]) } : t));
          void replaceMessage(parentId);
        } else setMessages((ms) => mergeMessages(ms, [saved]));
      } catch (e) {
        const failed = (m: ChatMessage) => (m.id === id ? { ...m, pending: false, failed: true } : m);
        if (parentId) setThread((t) => (t ? { ...t, replies: t.replies.map(failed) } : t));
        else setMessages((ms) => ms.map(failed));
        toast.error((e as Error).message?.includes("fetch") ? "No connection — the message wasn't sent." : (e as Error).message);
      }
    },
    [channel.id, channel.project_id, me, replaceMessage],
  );

  const actions: MessageActions = {
    onReact: async (m, emoji) => {
      const res = await toggleReaction(m.id, emoji);
      if (!res.ok) toast.error(res.error);
      else void replaceMessage(m.id);
    },
    onOpenPhotos: (photos, index) => setViewer({ photos, index }),
    onReply: (m) => {
      threadRef.current = m.id;
      setThread({ parent: m, replies: [] });
      void reloadThread(m.id);
    },
    onEdit: async (m, body) => {
      const res = await editMessage(m.id, body);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      void replaceMessage(m.id);
      return true;
    },
    onDelete: async (m) => {
      if (!(await confirm("Delete this message?", { body: "Its photos and files are removed too." }))) return;
      const res = await deleteMessage(m.id);
      if (!res.ok) return void toast.error(res.error);
      void replaceMessage(m.id);
      if (m.parent_id) void replaceMessage(m.parent_id);
    },
    onRetry: (m) => {
      const d = drafts.current.get(m.id);
      if (d) void send(d.draft, d.parentId, m.id);
    },
  };

  async function older() {
    const first = messages.find((m) => !m.pending);
    if (!first) return;
    setLoadingOlder(true);
    const el = scroller.current!;
    const prevHeight = el.scrollHeight;
    const res = await loadOlder(channel.id, first.created_at);
    setLoadingOlder(false);
    if (!res.ok) return void toast.error(res.error);
    setHasOlder((res.data?.length ?? 0) >= 40);
    setMessages((ms) => mergeMessages(ms, res.data ?? []));
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - prevHeight));
  }

  // "Go to message" from Photos & files: open the thread for replies; otherwise load
  // earlier messages until it's on screen, then scroll to it and highlight it briefly.
  async function goToMessage(messageId: string, parentId: string | null) {
    if (parentId) {
      const res = await loadMessage(parentId);
      if (!res.ok || !res.data) return void toast.error("That message is no longer available.");
      actions.onReply?.(res.data);
      return;
    }
    let list = messages;
    let more = hasOlder;
    for (let page = 0; !list.some((m) => m.id === messageId) && more && page < 25; page++) {
      const first = list.find((m) => !m.pending);
      if (!first) break;
      const res = await loadOlder(channel.id, first.created_at);
      if (!res.ok) return void toast.error(res.error);
      more = (res.data?.length ?? 0) >= 40;
      list = mergeMessages(list, res.data ?? []);
    }
    setMessages(list);
    setHasOlder(more);
    if (!list.some((m) => m.id === messageId)) return void toast.error("That message is too far back to show.");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(`msg-${messageId}`);
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2500);
      }),
    );
  }

  const typeLabel = channel.type === "project" ? "Project chat" : channel.type === "management" ? "Managers & administrators only" : "Company announcements";

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] top-14 z-20 flex flex-col bg-background md:static md:inset-auto md:z-auto md:h-full md:min-h-0">
      {/* Header */}
      <header className="flex items-center gap-2 border-b bg-card px-2 py-1.5">
        <Link href="/chats" className="flex size-11 items-center justify-center rounded-lg hover:bg-accent md:hidden" aria-label="All chats">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate font-semibold">{channel.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{channel.description || typeLabel}</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`${people.length} people can read this chat`}>
              <Users aria-hidden /> {people.length}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-1">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who can read this chat</p>
            <ul className="max-h-72 overflow-y-auto">
              {people.map((p) => (
                <li key={p.user_id} className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm">
                  <UserAvatar person={p} src={p.avatar_src} size={28} /> {personName(p)}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Chat options">
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setMediaOpen(true)}>
              <Images /> Photos &amp; files
            </DropdownMenuItem>
            {channel.project_id && (
              <DropdownMenuItem onSelect={() => router.push(`/projects/${channel.project_id}/board`)}>
                <FolderOpen /> Open project
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={async () => {
                const res = await setMuted(channel.id, !muted);
                if (!res.ok) return void toast.error(res.error);
                setMutedState(!muted);
                toast.success(res.message ?? "Saved");
                refreshUnread();
              }}
            >
              {muted ? <Bell /> : <BellOff />} {muted ? "Unmute" : "Mute"}
            </DropdownMenuItem>
            {me.isManager && channel.type !== "project" && (
              <DropdownMenuItem
                destructive
                onSelect={async () => {
                  if (!(await confirm(`Archive “${channel.name}”?`, { body: "It disappears from everyone's chat list. Messages are kept.", confirmLabel: "Archive" }))) return;
                  const res = await archiveChannel(channel.id);
                  if (!res.ok) return void toast.error(res.error);
                  router.push("/chats");
                }}
              >
                <Archive /> Archive chat
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Messages */}
      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 md:px-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (atBottom.current && newBelow) setNewBelow(0);
        }}
        aria-live="polite"
      >
        {hasOlder && (
          <div className="flex justify-center py-2">
            <Button variant="outline" size="sm" onClick={older} disabled={loadingOlder}>
              {loadingOlder && <Loader2 className="animate-spin" aria-hidden />} Load earlier messages
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">No messages yet.{channel.can_post ? " Say hello 👋" : ""}</p>
        )}
        <MessageList messages={messages} me={me} canPost={channel.can_post} people={people} actions={actions} />
      </div>
      {newBelow > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-24 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg"
        >
          <ArrowDown className="size-4" aria-hidden /> {newBelow} new {newBelow === 1 ? "message" : "messages"}
        </button>
      )}

      {/* Composer */}
      {channel.can_post ? (
        <Composer people={people.filter((p) => p.user_id !== me.id)} projectId={channel.project_id} placeholder={`Message ${channel.name}`} onSend={(d) => void send(d, null)} />
      ) : (
        <p className="border-t bg-muted/50 p-4 text-center text-sm text-muted-foreground">
          {channel.type === "general" ? "Only managers can post announcements here." : "You can read this chat but not write in it."}
        </p>
      )}

      {/* Reply thread */}
      <Sheet
        open={!!thread}
        onOpenChange={(o) => {
          if (!o) {
            threadRef.current = null;
            setThread(null);
          }
        }}
      >
        {thread && (
          <SheetContent title="Thread" description="Replies to a message" className="flex flex-col">
            <h2 className="border-b px-5 pb-3 pt-4 font-semibold">Thread</h2>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <MessageList messages={[thread.parent]} me={me} canPost={channel.can_post} people={people} actions={{ ...actions, onReply: undefined }} inThread />
              <div className="my-3 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {thread.replies.length} {thread.replies.length === 1 ? "reply" : "replies"}
                <span className="h-px flex-1 bg-border" />
              </div>
              <MessageList messages={thread.replies} me={me} canPost={channel.can_post} people={people} actions={{ ...actions, onReply: undefined }} inThread />
            </div>
            {channel.can_post && (
              <Composer people={people.filter((p) => p.user_id !== me.id)} projectId={channel.project_id} placeholder="Reply…" onSend={(d) => void send(d, thread.parent.id)} autoFocus />
            )}
          </SheetContent>
        )}
      </Sheet>
      {dialog}
      <Lightbox photos={viewer?.photos ?? []} index={viewer ? viewer.index : null} onClose={() => setViewer(null)} />
      <ChatMedia channelId={channel.id} open={mediaOpen} onClose={() => setMediaOpen(false)} onGoToMessage={(a) => void goToMessage(a.message_id, a.parent_id)} />
    </div>
  );
}
