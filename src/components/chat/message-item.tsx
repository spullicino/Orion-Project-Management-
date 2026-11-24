"use client";

import { AlertCircle, CheckSquare, Copy, FileText, Loader2, MessageSquareReply, MoreHorizontal, Pencil, RotateCcw, SmilePlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Lightbox, type LightboxPhoto } from "@/components/diary/lightbox";
import { UserAvatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { chatTime, personName, segmentBody } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { isImageAttachment, type ChatMessage, type ChatPerson } from "@/types/chat";

export const QUICK_EMOJI = ["👍", "❤️", "😂", "✅"];
export const ALL_EMOJI = ["👍", "❤️", "😂", "😮", "🎉", "✅", "🙏", "👀"];

export type MessageActions = {
  onReact: (m: ChatMessage, emoji: string) => void;
  onReply?: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage, body: string) => Promise<boolean>;
  onDelete: (m: ChatMessage) => void;
  onRetry?: (m: ChatMessage) => void;
  /** Opens the chat's photo viewer (kept outside the message so live updates can't disturb it). */
  onOpenPhotos?: (photos: LightboxPhoto[], index: number) => void;
};

function Body({ m, people, meId }: { m: ChatMessage; people: ChatPerson[]; meId: string }) {
  const mentioned = people.filter((p) => m.mentions.includes(p.user_id)).map((p) => ({ id: p.user_id, name: personName(p) }));
  return (
    <p className="whitespace-pre-wrap break-words">
      {segmentBody(m.body, mentioned, meId).map((s, i) =>
        s.type === "mention" ? (
          <span key={i} className={cn("rounded px-0.5 font-semibold", s.me ? "bg-amber-400/30 text-foreground" : "text-primary")}>
            {s.text}
          </span>
        ) : s.type === "link" ? (
          <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all" onClick={(e) => e.stopPropagation()}>
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

function Attachments({ m, onOpenPhotos }: { m: ChatMessage; onOpenPhotos?: MessageActions["onOpenPhotos"] }) {
  const [open, setOpen] = useState<number | null>(null);
  const images = m.attachments.filter(isImageAttachment);
  const files = m.attachments.filter((a) => !isImageAttachment(a));
  if (!m.attachments.length) return null;
  const photos = images.map((a) => ({ id: a.id, full_url: a.url, thumb_url: a.thumb_url, meta: `${personName(m.author ?? { first_name: null, last_name: null })} · ${chatTime(m.created_at)}` }));
  return (
    <div className="mt-1.5 grid gap-1.5">
      {images.length > 0 && (
        <ul className={cn("grid max-w-md gap-1", images.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")}>
          {images.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenPhotos) onOpenPhotos(photos, i);
                  else setOpen(i);
                }}
                className={cn("block w-full overflow-hidden rounded-lg bg-muted", images.length === 1 ? "max-h-72" : "aspect-square")}
                aria-label={`Open photo ${i + 1} of ${images.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs */}
                <img
                  src={a.thumb_url ?? a.url ?? ""}
                  alt=""
                  loading="lazy"
                  className={cn("size-full object-cover", images.length === 1 && "max-h-72 w-auto object-contain")}
                  style={images.length === 1 && a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.map((a) => (
        <a
          key={a.id}
          href={a.url ?? "#"}
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
          className="flex max-w-sm items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent"
        >
          <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{a.file_name}</span>
          {a.size_bytes ? <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(a.size_bytes / 1024))} KB</span> : null}
        </a>
      ))}
      {!onOpenPhotos && <Lightbox photos={photos} index={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function MessageItem({
  m,
  showHeader,
  meId,
  isAdmin,
  canPost,
  people,
  selected,
  onSelect,
  actions,
  inThread,
}: {
  m: ChatMessage;
  showHeader: boolean;
  meId: string;
  isAdmin: boolean;
  canPost: boolean;
  people: ChatPerson[];
  selected: boolean;
  onSelect: (id: string | null) => void;
  actions: MessageActions;
  inThread?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const mine = m.author_id === meId;
  const author = m.author ?? { first_name: null, last_name: null, email: null, avatar_url: null };
  const canDelete = !m.deleted && !m.pending && (mine || isAdmin);
  const mentionsMe = m.mentions.includes(meId);

  return (
    <div
      id={inThread ? undefined : `msg-${m.id}`}
      className={cn(
        "group relative flex gap-3 rounded-lg px-2 transition-colors",
        showHeader ? "mt-3 pt-1" : "mt-0.5",
        selected ? "bg-accent" : "md:hover:bg-accent/50",
        mentionsMe && !selected && "bg-amber-400/10",
        m.pending && "opacity-70",
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,textarea,input")) return;
        if (!m.deleted && !m.pending && !editing) onSelect(selected ? null : m.id);
      }}
    >
      <div className="w-9 shrink-0">{showHeader && <UserAvatar person={author} src={m.author_avatar_src} size={36} />}</div>
      <div className="min-w-0 flex-1 pb-1">
        {showHeader && (
          <p className="flex items-baseline gap-2">
            <span className="font-semibold">{personName(author)}</span>
            <span className="text-xs text-muted-foreground">{chatTime(m.created_at)}</span>
          </p>
        )}

        {m.deleted ? (
          <p className="text-sm italic text-muted-foreground">Message deleted</p>
        ) : editing ? (
          <form
            className="grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await actions.onEdit(m, draft)) setEditing(false);
            }}
          >
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus className="min-h-16" aria-label="Edit message" />
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={!draft.trim()}>
                Save
              </Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => { setEditing(false); setDraft(m.body); }}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            {m.body && <Body m={m} people={people} meId={meId} />}
            {m.task && (
              <Link
                href={`/projects/${m.task.project_id}/board?task=${m.task.id}`}
                className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm font-medium hover:bg-accent"
                onClick={(e) => e.stopPropagation()}
              >
                <CheckSquare className={cn("size-4 shrink-0", m.task.completed ? "text-success" : "text-primary")} aria-hidden />
                <span className={cn("truncate", m.task.completed && "line-through text-muted-foreground")}>{m.task.title}</span>
              </Link>
            )}
            <Attachments m={m} onOpenPhotos={actions.onOpenPhotos} />
            {m.edited_at && <span className="text-xs text-muted-foreground"> (edited)</span>}
          </>
        )}

        {m.pending && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Sending…
          </p>
        )}
        {m.failed && (
          <p className="mt-1 flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="size-3.5" aria-hidden /> Not sent.
            {actions.onRetry && (
              <button type="button" className="inline-flex items-center gap-1 font-semibold underline" onClick={() => actions.onRetry!(m)}>
                <RotateCcw className="size-3" aria-hidden /> Try again
              </button>
            )}
          </p>
        )}

        {/* Reactions */}
        {m.reactions.length > 0 && !m.deleted && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => canPost && actions.onReact(m, r.emoji)}
                title={r.names.filter(Boolean).join(", ")}
                aria-pressed={r.mine}
                aria-label={`${r.emoji} ${r.count}: ${r.names.join(", ")}`}
                className={cn("inline-flex h-9 min-w-11 items-center justify-center gap-1 rounded-full border px-2.5 text-sm", r.mine ? "border-primary bg-primary/10" : "bg-card", canPost && "hover:bg-accent")}
              >
                <span>{r.emoji}</span>
                <span className="text-xs font-semibold tabular-nums">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread link */}
        {!inThread && m.reply_count > 0 && actions.onReply && (
          <button type="button" onClick={() => actions.onReply!(m)} className="mt-1 inline-flex h-10 items-center gap-1 rounded-md pr-2 text-sm font-semibold text-primary hover:underline">
            <MessageSquareReply className="size-4" aria-hidden />
            {m.reply_count} {m.reply_count === 1 ? "reply" : "replies"}
          </button>
        )}

        {/* Actions: on phones they appear when you tap the message; on computers on hover. */}
        {!m.deleted && !m.pending && !editing && (
          <div
            className={cn(
              "z-10 mt-1 items-center gap-0.5 rounded-xl border bg-popover p-1 shadow-sm",
              selected ? "flex" : "hidden",
              "md:absolute md:-top-4 md:right-2 md:mt-0 md:group-hover:flex",
            )}
          >
            {canPost &&
              QUICK_EMOJI.map((e) => (
                <button key={e} type="button" onClick={() => { actions.onReact(m, e); onSelect(null); }} className="flex size-10 items-center justify-center rounded-lg text-lg hover:bg-accent md:size-8" aria-label={`React ${e}`}>
                  {e}
                </button>
              ))}
            {canPost && (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="flex size-10 items-center justify-center rounded-lg hover:bg-accent md:size-8" aria-label="More reactions">
                    <SmilePlus className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="grid w-auto grid-cols-4 gap-1 p-1.5" align="end">
                  {ALL_EMOJI.map((e) => (
                    <button key={e} type="button" onClick={() => { actions.onReact(m, e); onSelect(null); }} className="flex size-11 items-center justify-center rounded-lg text-xl hover:bg-accent" aria-label={`React ${e}`}>
                      {e}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            {!inThread && actions.onReply && (
              <button type="button" onClick={() => { actions.onReply!(m); onSelect(null); }} className="flex size-10 items-center justify-center rounded-lg hover:bg-accent md:size-8" aria-label="Reply in thread">
                <MessageSquareReply className="size-4" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex size-10 items-center justify-center rounded-lg hover:bg-accent md:size-8" aria-label="More options">
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {m.body && (
                  <DropdownMenuItem
                    onSelect={() => {
                      void navigator.clipboard?.writeText(m.body).then(() => toast.success("Copied"));
                      onSelect(null);
                    }}
                  >
                    <Copy /> Copy text
                  </DropdownMenuItem>
                )}
                {mine && m.body && (
                  <DropdownMenuItem onSelect={() => { setDraft(m.body); setEditing(true); onSelect(null); }}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem destructive onSelect={() => { actions.onDelete(m); onSelect(null); }}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
}
