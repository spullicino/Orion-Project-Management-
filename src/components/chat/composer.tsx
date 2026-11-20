"use client";

import { CheckSquare, FileText, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { loadLinkableTasks } from "@/app/(app)/chats/actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterPeople, mentionQuery, personName } from "@/lib/chat";
import { processPhoto } from "@/lib/images/compress";
import { cn } from "@/lib/utils";
import type { ChatPerson } from "@/types/chat";

export type DraftFile = {
  id: string;
  kind: "image" | "file";
  name: string;
  mime: string;
  /** For images: compressed full size + preview. For files: the original. */
  blob: Blob;
  thumb?: Blob;
  width: number | null;
  height: number | null;
  previewUrl?: string;
};

export type Draft = { body: string; mentions: string[]; files: DraftFile[]; task: { id: string; title: string } | null };

const MAX_FILES = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function Composer({
  people,
  projectId,
  placeholder,
  onSend,
  autoFocus,
}: {
  people: ChatPerson[];
  projectId?: string | null;
  placeholder: string;
  onSend: (draft: Draft) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [mentions, setMentions] = useState<Map<string, string>>(new Map()); // "Tina Camilleri" -> id
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [task, setTask] = useState<{ id: string; title: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [enterSends, setEnterSends] = useState(false);

  useEffect(() => {
    // Computers (precise pointer): Enter sends, Shift+Enter = new line. Phones: the send button.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depends on the device
    setEnterSends(window.matchMedia("(pointer: fine)").matches);
  }, []);

  // Grow the box with the text, up to ~6 lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const q = mentionQuery(text, caret);
  const suggestions = useMemo(() => (q ? filterPeople(people, q.query) : []), [q, people]);

  function pickMention(p: ChatPerson) {
    if (!q) return;
    const label = personName(p);
    const next = `${text.slice(0, q.start)}@${label} ${text.slice(caret)}`;
    setText(next);
    setMentions((m) => new Map(m).set(label, p.user_id));
    const pos = q.start + label.length + 2;
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const room = MAX_FILES - files.length - preparing;
    const chosen = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) toast.warning(`You can attach up to ${MAX_FILES} files per message.`);
    setPreparing((n) => n + chosen.length);
    for (const f of chosen) {
      try {
        if (f.type.startsWith("image/") && !/gif|svg/.test(f.type)) {
          const p = await processPhoto(f);
          setFiles((fs) => [...fs, { id: p.id, kind: "image", name: f.name, mime: "image/jpeg", blob: p.full, thumb: p.thumb, width: p.width, height: p.height, previewUrl: p.previewUrl }]);
        } else {
          if (f.size > MAX_FILE_BYTES) throw new Error(`${f.name} is larger than 25 MB.`);
          setFiles((fs) => [...fs, { id: crypto.randomUUID(), kind: "file", name: f.name, mime: f.type || "application/octet-stream", blob: f, width: null, height: null }]);
        }
      } catch (e) {
        toast.error((e as Error).message || `Couldn't add ${f.name}.`);
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  }

  function send() {
    if (preparing) return void toast.info("Please wait — files are still being prepared.");
    const body = text.trim();
    if (!body && !files.length && !task) return;
    // Keep only mentions whose "@Name" is still in the text.
    const ids = [...mentions.entries()].filter(([label]) => body.includes(`@${label}`)).map(([, id]) => id);
    onSend({ body: body || (task ? "" : ""), mentions: ids, files, task });
    setText("");
    setFiles([]);
    setTask(null);
    setMentions(new Map());
    setCaret(0);
    area.current?.focus();
  }

  return (
    <div className="relative border-t bg-card p-2 pb-safe">
      {/* @mention suggestions */}
      {q && suggestions.length > 0 && (
        <ul role="listbox" aria-label="People to mention" className="absolute bottom-full left-2 right-2 mb-1 max-h-64 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg sm:right-auto sm:w-72">
          {suggestions.map((p, i) => (
            <li key={p.user_id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(p)}
                className={cn("flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm", i === highlight ? "bg-accent" : "hover:bg-accent")}
              >
                <UserAvatar person={p} src={p.avatar_src} size={28} />
                {personName(p)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Attachments & linked task waiting to be sent */}
      {(files.length > 0 || preparing > 0 || task) && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {task && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-background py-1 pl-2 pr-1 text-sm">
              <CheckSquare className="size-4 text-primary" aria-hidden />
              <span className="truncate">{task.title}</span>
              <button type="button" onClick={() => setTask(null)} className="flex size-7 items-center justify-center rounded hover:bg-accent" aria-label="Remove task link">
                <X className="size-3.5" />
              </button>
            </span>
          )}
          {files.map((f) =>
            f.kind === "image" ? (
              <span key={f.id} className="relative size-16 overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={f.previewUrl} alt="" className="size-full object-cover" />
                <button type="button" onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))} className="absolute right-0.5 top-0.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Remove photo">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              <span key={f.id} className="inline-flex max-w-56 items-center gap-1.5 rounded-lg border bg-background py-1 pl-2 pr-1 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{f.name}</span>
                <button type="button" onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))} className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-accent" aria-label={`Remove ${f.name}`}>
                  <X className="size-3.5" />
                </button>
              </span>
            ),
          )}
          {Array.from({ length: preparing }).map((_, i) => (
            <span key={`prep${i}`} className="flex size-16 items-center justify-center rounded-lg bg-muted">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Preparing file" />
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1">
        <input ref={fileInput} type="file" multiple className="sr-only" tabIndex={-1} aria-label="Choose photos or files" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" onClick={() => fileInput.current?.click()} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Attach photos or files">
          <Paperclip className="size-5" />
        </button>
        {projectId && <TaskLinkButton projectId={projectId} onPick={setTask} />}
        <textarea
          ref={area}
          rows={1}
          value={text}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={8000}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setHighlight(0);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (q && suggestions.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % suggestions.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(suggestions[highlight] ?? suggestions[0]); return; }
            }
            if (e.key === "Enter" && !e.shiftKey && enterSends) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-base leading-6 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={(!text.trim() && !files.length && !task) || preparing > 0}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
          aria-label="Send"
        >
          <SendHorizontal className="size-5" />
        </button>
      </div>
    </div>
  );
}

function TaskLinkButton({ projectId, onPick }: { projectId: string; onPick: (t: { id: string; title: string }) => void }) {
  const [tasks, setTasks] = useState<{ id: string; title: string; completed: boolean }[] | null>(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !tasks) void loadLinkableTasks(projectId).then((r) => (r.ok ? setTasks(r.data ?? []) : toast.error(r.error)));
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Link a task">
          <CheckSquare className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-80 p-2">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a task" aria-label="Find a task" className="mb-2" autoFocus />
        <ul className="max-h-64 overflow-y-auto">
          {tasks === null && <li className="p-2 text-sm text-muted-foreground">Loading…</li>}
          {tasks
            ?.filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()))
            .slice(0, 50)
            .map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({ id: t.id, title: t.title });
                    setOpen(false);
                  }}
                  className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-accent", t.completed && "text-muted-foreground line-through")}
                >
                  <CheckSquare className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{t.title}</span>
                </button>
              </li>
            ))}
          {tasks?.length === 0 && <li className="p-2 text-sm text-muted-foreground">This project has no tasks yet.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
