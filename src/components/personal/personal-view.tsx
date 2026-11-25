"use client";

import { Check, ChevronDown, ChevronRight, List, Lock, Pin, PinOff, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addTodo,
  clearDoneTodos,
  deleteNote,
  deleteTodo,
  saveNote,
  updateTodo,
  type PersonalNote,
  type PersonalTodo,
} from "@/app/(app)/personal/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DUE_STYLES, dueState, shortDate } from "@/lib/board";
import { listTime } from "@/lib/chat";
import { autoBullet, enterInBullet, toggleBullets, type Edit } from "@/lib/note-bullets";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// To-do
// ---------------------------------------------------------------------------

function sortTodos(a: PersonalTodo, b: PersonalTodo) {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date) || a.position - b.position;
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return a.position - b.position;
}

function TodoItem({ todo, onChange, onDelete }: { todo: PersonalTodo; onChange: (patch: Partial<PersonalTodo> & { done?: boolean }) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const isDone = !!todo.done_at;
  const state = dueState(todo.due_date, isDone);
  return (
    <li className="group flex items-center gap-1 rounded-xl border bg-card pr-1">
      <button
        type="button"
        onClick={() => onChange({ done: !isDone })}
        aria-pressed={isDone}
        aria-label={isDone ? `Mark “${todo.title}” as not done` : `Mark “${todo.title}” as done`}
        className="flex size-12 shrink-0 items-center justify-center"
      >
        <span className={cn("flex size-6 items-center justify-center rounded-full border-2", isDone ? "border-success bg-success text-white" : "border-muted-foreground/50")}>
          {isDone && <Check className="size-4" aria-hidden />}
        </span>
      </button>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft.trim() && draft.trim() !== todo.title) onChange({ title: draft.trim() });
            else setDraft(todo.title);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(todo.title);
              setEditing(false);
            }
          }}
          aria-label="To-do"
          maxLength={300}
          className="h-10 flex-1"
        />
      ) : (
        <button type="button" onClick={() => !isDone && setEditing(true)} className={cn("min-h-12 min-w-0 flex-1 py-2 text-left", isDone && "text-muted-foreground line-through")}>
          {todo.title}
        </button>
      )}
      {!isDone && (
        <label className="relative flex h-11 shrink-0 cursor-pointer items-center rounded-lg px-2 text-sm hover:bg-accent">
          <span className={todo.due_date ? DUE_STYLES[state] : "text-muted-foreground"}>{todo.due_date ? shortDate(todo.due_date) : "Date"}</span>
          <input
            type="date"
            aria-label="Due date"
            value={todo.due_date ?? ""}
            onChange={(e) => onChange({ due_date: e.target.value || null })}
            className="absolute inset-0 cursor-pointer text-base opacity-0"
          />
        </label>
      )}
      <button type="button" onClick={onDelete} aria-label={`Delete “${todo.title}”`} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function TodoList({ initial }: { initial: PersonalTodo[] }) {
  const [todos, setTodos] = useState(initial);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh server data replaces local state
  useEffect(() => setTodos(initial), [initial]);

  const open = todos.filter((t) => !t.done_at).sort(sortTodos);
  const finished = todos.filter((t) => t.done_at).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  const change = (t: PersonalTodo, patch: Partial<PersonalTodo> & { done?: boolean }) => {
    const before = todos;
    const next = { ...t, ...patch, ...(patch.done === undefined ? {} : { done_at: patch.done ? new Date().toISOString() : null }) };
    delete (next as { done?: boolean }).done;
    setTodos((ts) => ts.map((x) => (x.id === t.id ? next : x)));
    void updateTodo(t.id, { title: patch.title, due_date: patch.due_date, done: patch.done }).then((r) => {
      if (!r.ok) {
        setTodos(before);
        toast.error(r.error);
      }
    });
  };

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          start(async () => {
            const r = await addTodo({ title, due_date: due || null });
            if (!r.ok) return void toast.error(r.error);
            setTodos((ts) => [...ts, r.data!]);
            setTitle("");
            setDue("");
          });
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a to-do… e.g. Call the supplier" aria-label="New to-do" maxLength={300} className="min-w-0 flex-1 basis-60" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" placeholder="Due date" className="w-auto" />
        <Button type="submit" disabled={pending || !title.trim()}>
          <Plus aria-hidden /> Add
        </Button>
      </form>

      {open.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Nothing to do. Add something above. ✍️</p>
      ) : (
        <ul className="grid gap-2">
          {open.map((t) => (
            <TodoItem
              key={t.id}
              todo={t}
              onChange={(p) => change(t, p)}
              onDelete={async () => {
                if (!(await confirm(`Delete “${t.title}”?`, { body: "This to-do will be gone for good." }))) return;
                setTodos((ts) => ts.filter((x) => x.id !== t.id));
                const r = await deleteTodo(t.id);
                if (!r.ok) toast.error(r.error);
              }}
            />
          ))}
        </ul>
      )}

      {finished.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="flex h-11 items-center gap-1 text-sm font-semibold text-muted-foreground">
              {showDone ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Done ({finished.length})
            </button>
            {showDone && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!(await confirm("Clear all done to-dos?", { confirmLabel: "Clear" }))) return;
                  setTodos((ts) => ts.filter((t) => !t.done_at));
                  const r = await clearDoneTodos();
                  if (!r.ok) toast.error(r.error);
                }}
              >
                Clear done
              </Button>
            )}
          </div>
          {showDone && (
            <ul className="mt-1 grid gap-2">
              {finished.map((t) => (
                <TodoItem
                  key={t.id}
                  todo={t}
                  onChange={(p) => change(t, p)}
                  onDelete={async () => {
                    if (!(await confirm(`Delete “${t.title}”?`, { body: "This to-do will be gone for good." }))) return;
                    setTodos((ts) => ts.filter((x) => x.id !== t.id));
                    const r = await deleteTodo(t.id);
                    if (!r.ok) toast.error(r.error);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      )}
      {dialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const NOTE_COLORS = [
  { value: "#ffffff", label: "White" },
  { value: "#fef9c3", label: "Yellow" },
  { value: "#dcfce7", label: "Green" },
  { value: "#dbeafe", label: "Blue" },
  { value: "#fce7f3", label: "Pink" },
  { value: "#ede9fe", label: "Purple" },
  { value: "#ffedd5", label: "Orange" },
];

type Draft = { title: string; body: string; color: string; pinned: boolean };

function NoteEditor({ note, onSaved, onDeleted, onClose }: { note: PersonalNote | null; onSaved: (n: PersonalNote) => void; onDeleted: (id: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>({ title: note?.title ?? "", body: note?.body ?? "", color: note?.color ?? "#ffffff", pinned: note?.pinned ?? false });
  const [id, setId] = useState(note?.id ?? null);
  const [status, setStatus] = useState<"saved" | "saving" | "idle">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(draft);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { confirm, dialog } = useConfirm();

  const pendingCursor = useRef<Edit | null>(null);

  // Applies a bullet-list edit; the cursor is put back as soon as the new text is on screen.
  const applyEdit = (e: Edit) => {
    pendingCursor.current = e;
    update({ body: e.text });
  };
  useLayoutEffect(() => {
    const el = bodyRef.current;
    const want = pendingCursor.current;
    if (!el || !want || el.value !== want.text) return;
    pendingCursor.current = null;
    el.focus();
    el.setSelectionRange(want.start, want.end);
  });

  const save = async (d: Draft) => {
    if (!id && !d.title.trim() && !d.body.trim()) return; // don't create empty notes
    setStatus("saving");
    const r = await saveNote(id, d);
    if (!r.ok) {
      setStatus("idle");
      return void toast.error(r.error);
    }
    setId(r.data!.id);
    onSaved(r.data!);
    setStatus("saved");
  };

  // Saves automatically a moment after you stop typing.
  const update = (patch: Partial<Draft>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft(next);
    setStatus("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 800);
  };

  const close = async () => {
    clearTimeout(timer.current);
    if (status !== "saved") await save(latest.current);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && void close()}>
      <DialogContent title={id ? "Note" : "New note"} className="max-w-2xl" style={{ background: draft.color }}>
        <div className="grid gap-3 text-slate-900">
          <input
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Title"
            aria-label="Title"
            maxLength={200}
            className="w-full bg-transparent text-xl font-semibold placeholder:text-slate-500 focus:outline-none"
          />
          <div className="-ml-3 flex">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const el = bodyRef.current;
                const start = el?.selectionStart ?? draft.body.length;
                const end = el?.selectionEnd ?? draft.body.length;
                applyEdit(toggleBullets(draft.body, start, end));
              }}
              className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium hover:bg-slate-900/5"
            >
              <List className="size-4" aria-hidden /> Bullet list
            </button>
          </div>
          <textarea
            ref={bodyRef}
            value={draft.body}
            onChange={(e) => {
              const auto = autoBullet(e.target.value, e.target.selectionStart);
              if (auto) applyEdit(auto);
              else update({ body: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              const el = e.currentTarget;
              const edit = enterInBullet(el.value, el.selectionStart, el.selectionEnd);
              if (edit) {
                e.preventDefault();
                applyEdit(edit);
              }
            }}
            placeholder="Write anything…"
            aria-label="Note"
            maxLength={20000}
            autoFocus={!note}
            className="min-h-64 w-full resize-y bg-transparent text-base leading-relaxed placeholder:text-slate-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-900/10 pt-3">
            <div role="radiogroup" aria-label="Colour" className="flex gap-1.5">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === c.value}
                  aria-label={c.label}
                  onClick={() => update({ color: c.value })}
                  className={cn("size-8 rounded-full border border-slate-900/20", draft.color === c.value && "ring-2 ring-slate-900 ring-offset-2")}
                  style={{ background: c.value }}
                />
              ))}
            </div>
            <button type="button" onClick={() => update({ pinned: !draft.pinned })} aria-pressed={draft.pinned} className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium hover:bg-slate-900/5">
              {draft.pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
              {draft.pinned ? "Unpin" : "Pin to top"}
            </button>
            {id && (
              <button
                type="button"
                onClick={async () => {
                  if (!(await confirm("Delete this note?"))) return;
                  clearTimeout(timer.current);
                  const r = await deleteNote(id);
                  if (!r.ok) return void toast.error(r.error);
                  onDeleted(id);
                  onClose();
                }}
                className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-500/10"
              >
                <Trash2 className="size-4" aria-hidden /> Delete
              </button>
            )}
            <span className="ml-auto text-xs text-slate-600" aria-live="polite">
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
            </span>
            <Button onClick={() => void close()}>Done</Button>
          </div>
        </div>
        {dialog}
      </DialogContent>
    </Dialog>
  );
}

function NotesGrid({ initial }: { initial: PersonalNote[] }) {
  const [notes, setNotes] = useState(initial);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PersonalNote | "new" | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh server data replaces local state
  useEffect(() => setNotes(initial), [initial]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return notes
      .filter((n) => !term || `${n.title} ${n.body}`.toLowerCase().includes(term))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  }, [notes, q]);

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" aria-label="Search notes" className="pl-9" />
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden /> New note
        </Button>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{q ? "No notes match your search." : "No notes yet. Tap “New note” to write one."}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setEditing(n)}
                className="flex h-full min-h-32 w-full flex-col rounded-xl border p-4 text-left text-slate-900 shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ background: n.color }}
              >
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{n.title || <span className="text-slate-500">Untitled</span>}</span>
                  {n.pinned && <Pin className="size-4 shrink-0" aria-label="Pinned" />}
                </span>
                <span className="mt-1 line-clamp-6 whitespace-pre-wrap break-words text-sm text-slate-700">{n.body}</span>
                <span className="mt-auto pt-2 text-xs text-slate-600">{listTime(n.updated_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <NoteEditor
          key={editing === "new" ? "new" : editing.id}
          note={editing === "new" ? null : editing}
          onSaved={(n) => setNotes((ns) => (ns.some((x) => x.id === n.id) ? ns.map((x) => (x.id === n.id ? n : x)) : [n, ...ns]))}
          onDeleted={(id) => setNotes((ns) => ns.filter((x) => x.id !== id))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PersonalView({ todos, notes, initialTab }: { todos: PersonalTodo[]; notes: PersonalNote[]; initialTab?: "todo" | "notes" }) {
  const [tab, setTab] = useState<"todo" | "notes">(initialTab ?? "todo");
  const openCount = todos.filter((t) => !t.done_at).length;
  return (
    <div className="grid gap-5">
      <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0" aria-hidden /> Only you can see this page — not your manager, not the administrators.
      </p>
      <div role="tablist" aria-label="Personal" className="inline-flex w-fit rounded-lg border bg-card p-0.5">
        {(
          [
            { key: "todo", label: `To-do${openCount ? ` (${openCount})` : ""}`, icon: Check },
            { key: "notes", label: `Notes${notes.length ? ` (${notes.length})` : ""}`, icon: StickyNote },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn("flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium", tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === "todo" ? <TodoList initial={todos} /> : <NotesGrid initial={notes} />}</div>
    </div>
  );
}
