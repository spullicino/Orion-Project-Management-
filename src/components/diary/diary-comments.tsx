"use client";

import { Loader2, MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addDailyComment,
  dailyCommentPeople,
  deleteDailyComment,
  editDailyComment,
  listDailyComments,
  type DailyComment,
  type MentionPerson,
} from "@/app/(app)/daily-update/comment-actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));

/** "@Name" shown in bold. */
function Body({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {text.split(/(@[A-Z][\w'-]*(?: [A-Z][\w'-]*)?)/).map((part, i) =>
        part.startsWith("@") ? (
          <strong key={i} className="font-semibold text-primary">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </p>
  );
}

/** The "Comments (2)" button under a daily update, and the conversation it opens. */
export function DiaryComments({
  updateId,
  count,
  me,
  startOpen = false,
  preview,
}: {
  updateId: string;
  count: number;
  me: { id: string; isManager: boolean };
  startOpen?: boolean;
  /** Development previews only: show these instead of loading. */
  preview?: { comments: DailyComment[]; people: MentionPerson[] };
}) {
  const [open, setOpen] = useState(startOpen);
  const [comments, setComments] = useState<DailyComment[] | null>(preview?.comments ?? null);
  const [people, setPeople] = useState<MentionPerson[]>(preview?.people ?? []);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<MentionPerson[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const { confirm, dialog } = useConfirm();
  const loaded = useRef(!!preview);

  const load = async () => {
    const [res, ppl] = await Promise.all([listDailyComments(updateId), dailyCommentPeople(updateId)]);
    if (!res.ok) return void toast.error(res.error);
    setComments(res.data ?? []);
    setPeople(ppl.filter((p) => p.id !== me.id));
  };
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once, the first time it's opened
  }, [open]);

  const shownCount = comments?.length ?? count;
  const matches = query === null ? [] : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const onType = (value: string) => {
    setBody(value);
    const caret = box.current?.selectionStart ?? value.length;
    const m = /(?:^|\s)@([\w'-]*)$/.exec(value.slice(0, caret));
    setQuery(m ? m[1] : null);
  };
  const pick = (p: MentionPerson) => {
    const caret = box.current?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([\w'-]*)$/, `@${p.name} `);
    setBody(before + body.slice(caret));
    setMentions((m) => (m.some((x) => x.id === p.id) ? m : [...m, p]));
    setQuery(null);
    requestAnimationFrame(() => box.current?.focus());
  };

  return (
    <div className="mt-3 border-t pt-2">
      {dialog}
      <Button variant="ghost" size="sm" className="-ml-2" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MessageSquare aria-hidden /> {shownCount ? `Comments (${shownCount})` : "Comment"}
      </Button>
      {open && (
        <div className="mt-2 grid gap-3">
          {comments === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
            </p>
          ) : (
            comments.length > 0 && (
              <ul className="grid gap-2">
                {comments.map((c) => (
                  <li key={c.id} className="grid gap-1 rounded-lg bg-muted/60 p-3">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs">
                      <span className="font-semibold">{c.author}</span>
                      <span className="text-muted-foreground">
                        {when(c.created_at)}
                        {c.edited_at && " · edited"}
                      </span>
                      <span className="ml-auto flex">
                        {c.author_id === me.id && (
                          <button type="button" aria-label="Edit your comment" onClick={() => setEditing({ id: c.id, body: c.body })} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
                            <Pencil className="size-4" aria-hidden />
                          </button>
                        )}
                        {(c.author_id === me.id || me.isManager) && (
                          <button
                            type="button"
                            aria-label="Delete this comment"
                            onClick={async () => {
                              if (!(await confirm("Delete this comment?"))) return;
                              const res = await deleteDailyComment(c.id);
                              if (!res.ok) return void toast.error(res.error);
                              setComments((cs) => (cs ?? []).filter((x) => x.id !== c.id));
                            }}
                            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        )}
                      </span>
                    </div>
                    {editing?.id === c.id ? (
                      <form
                        className="grid gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const res = await editDailyComment(c.id, editing.body);
                          if (!res.ok) return void toast.error(res.error);
                          setEditing(null);
                          await load();
                        }}
                      >
                        <Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={3} maxLength={4000} aria-label="Edit comment" autoFocus />
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                          <Button type="submit" size="sm" disabled={!editing.body.trim()}>
                            Save
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <Body text={c.body} />
                    )}
                  </li>
                ))}
              </ul>
            )
          )}

          <form
            className="grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const kept = mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id);
              const res = await addDailyComment({ updateId, body, mentions: kept });
              setBusy(false);
              if (!res.ok) return void toast.error(res.error);
              setBody("");
              setMentions([]);
              await load();
            }}
          >
            <div className="relative">
              <Textarea
                ref={box}
                value={body}
                onChange={(e) => onType(e.target.value)}
                rows={2}
                maxLength={4000}
                placeholder="Write a comment… type @ to mention someone"
                aria-label="Write a comment"
              />
              {matches.length > 0 && (
                <ul role="listbox" aria-label="Mention someone" className="absolute left-0 right-0 top-full z-20 mt-1 grid max-h-60 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button type="button" role="option" aria-selected={false} onClick={() => pick(p)} className={cn("flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-accent")}>
                        @{p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button type="submit" size="sm" className="justify-self-end" disabled={busy || !body.trim()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Post
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
