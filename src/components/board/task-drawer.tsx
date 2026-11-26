"use client";

import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Copy, Download, FileText, Link2, Loader2, Lock, Paperclip, Plus, Send, Trash2, X, CopyPlus, FileDiff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addChecklistItem,
  addComment,
  createAttachmentUpload,
  deleteAttachment,
  deleteChecklistItem,
  deleteComment,
  deleteTask,
  saveAttachment,
  setDependency,
  updateChecklistItem,
  updateTask,
} from "@/app/(app)/projects/actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { describeChange, shortDate } from "@/lib/board";
import { createClient } from "@/lib/supabase/client";
import { cn, fullName } from "@/lib/utils";
import { ATTACHMENT_MAX_BYTES } from "@/lib/validation/projects";
import type { BoardTask, TaskDetail } from "@/types/board";
import { useBoard } from "./board-context";
import { CopyTaskDialog } from "./copy-task-dialog";
import { DuplicateTaskDialog } from "./duplicate-task-dialog";
import { VariationDialog, VariationSection } from "./variations";
import { InsertTaskDialog } from "./insert-task-dialog";
import { DateCell, InternalSwitch, OwnerPicker, PriorityPicker, ProgressCell, RepeatPicker, StatusPicker } from "./cells";

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  );
}

/** Text that saves when you leave the field. */
function AutoSaveText({
  value,
  onSave,
  disabled,
  placeholder,
  label,
  multiline,
  className,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  label: string;
  multiline?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commit = async () => {
    if (draft === null || draft === value) return setDraft(null);
    await onSave(draft);
    setDraft(null);
  };
  if (multiline)
    return (
      <Textarea
        aria-label={label}
        value={shown}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className={className}
      />
    );
  return (
    <Input
      aria-label={label}
      value={shown}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={className}
    />
  );
}

function DrawerBody({ task }: { task: BoardTask }) {
  const { board, perms, patchTask, labelsById, openTask, byId, loadTaskDetail, tasks: allTasks, moveTask } = useBoard();
  const groupTasks = allTasks.filter((t) => t.group_id === task.group_id);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [variationOpen, setVariationOpen] = useState(false);
  const [insert, setInsert] = useState<"above" | "below" | null>(null);
  const [checkItem, setCheckItem] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await loadTaskDetail(task.id);
    if (res.ok) {
      setDetail(res.data ?? null);
      setError(null);
    } else setError(res.error);
  }, [task.id, loadTaskDetail]);

  // Reload details when the task changes on the board (e.g. someone else edited it).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching data from the server
    void load();
  }, [load, task.updated_at, task.comment_count, task.checklist_total, task.checklist_done, task.attachment_count]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong");
      else {
        after?.();
        await load();
      }
    });

  const saveField = async (patch: { description?: string | null; internal_notes?: string | null; title?: string }) => {
    const res = await updateTask(task.id, patch);
    if (!res.ok) toast.error(res.error);
    else await load();
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.size > ATTACHMENT_MAX_BYTES) {
        toast.error(`${file.name} is larger than 25 MB.`);
        continue;
      }
      setUploading(file.name);
      try {
        const ticket = await createAttachmentUpload({ taskId: task.id, fileName: file.name, size: file.size, contentType: file.type });
        if (!ticket.ok || !ticket.data) throw new Error(ticket.ok ? "Upload failed" : ticket.error);
        const { error: upErr } = await createClient()
          .storage.from("project-files")
          .uploadToSignedUrl(ticket.data.path, ticket.data.token, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) throw new Error("Upload failed. Check your connection and try again.");
        const saved = await saveAttachment({ taskId: task.id, path: ticket.data.path, fileName: file.name, size: file.size, contentType: file.type });
        if (!saved.ok) throw new Error(saved.error);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
    await load();
  }

  const group = board.groups.find((g) => g.id === task.group_id);
  const otherTasks = board.tasks.filter((t) => t.id !== task.id && !task.blocked_by.includes(t.id));
  const lookup = {
    status: (id: string) => labelsById.get(id)?.name,
    group: (id: string) => board.groups.find((g) => g.id === id)?.name,
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-10 pt-4 md:pt-6">
      {/* Title + group */}
      <div className="mb-5 pr-10">
        {perms.canEdit ? (
          <select
            aria-label="Group"
            value={task.group_id}
            onChange={(e) => void patchTask(task.id, { group_id: e.target.value })}
            className="mb-1 h-9 max-w-full cursor-pointer rounded-md bg-transparent pr-1 text-sm font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ borderLeft: `4px solid ${group?.color ?? "transparent"}`, paddingLeft: 8 }}
          >
            {board.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mb-2 text-sm font-medium" style={{ borderLeft: `4px solid ${group?.color ?? "transparent"}`, paddingLeft: 8 }}>
            {group?.name}
          </p>
        )}
        {perms.canEdit ? (
          <AutoSaveText
            label="Task name"
            value={task.title}
            onSave={async (v) => {
              if (v.trim()) await patchTask(task.id, { title: v.trim() });
            }}
            className="h-auto border-transparent px-0 py-1 text-xl font-bold shadow-none hover:border-input focus-visible:px-2 md:text-xl"
          />
        ) : (
          <h2 className="text-xl font-bold">{task.title}</h2>
        )}
      </div>

      <div className="grid gap-7">
        {/* Quick fields */}
        <div className="grid gap-1.5">
          <Field label="Status">
            <StatusPicker task={task} />
          </Field>
          <Field label="Owners">
            <OwnerPicker task={task} />
          </Field>
          <Field label="Priority">
            <PriorityPicker task={task} />
          </Field>
          <Field label="Start">
            <DateCell task={task} field="start_date" />
          </Field>
          <Field label="Due">
            <DateCell task={task} field="due_date" />
          </Field>
          <Field label="Progress">
            <div className="w-48">
              <ProgressCell task={task} />
            </div>
          </Field>
          <Field label="Repeat">
            <RepeatPicker task={task} />
          </Field>
          <Field label="Internal">
            <InternalSwitch task={task} />
          </Field>
        </div>

        {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {!detail && !error && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading details…
          </p>
        )}

        {detail && (
          <>
            <VariationSection task={task} />

            <Section title="Description">
              {perms.canEdit ? (
                <AutoSaveText
                  multiline
                  label="Description"
                  value={detail.task.description ?? ""}
                  placeholder="Add details, measurements, instructions…"
                  onSave={(v) => saveField({ description: v || null })}
                  className="min-h-28"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm">{detail.task.description || <span className="text-muted-foreground">No description.</span>}</p>
              )}
            </Section>

            {/* Dependencies */}
            <Section title="Waiting for">
              {detail.blocked_by.length === 0 && <p className="text-sm text-muted-foreground">This task doesn&apos;t wait for any other task.</p>}
              <ul className="grid gap-1">
                {detail.blocked_by.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    {d.completed_at ? <Link2 className="size-4 text-success" aria-hidden /> : <Lock className="size-4 text-destructive" aria-hidden />}
                    <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => openTask(d.id)}>
                      {d.title}
                    </button>
                    <span className="text-xs text-muted-foreground">{d.completed_at ? "Done" : d.due_date ? `Due ${shortDate(d.due_date)}` : "Open"}</span>
                    {perms.canManage && (
                      <Button variant="ghost" size="icon" aria-label={`Stop waiting for ${d.title}`}
                        onClick={async () => {
                          if (await confirm(`Stop waiting for “${d.title}”?`, { body: "The link between the two tasks is removed (the tasks stay).", confirmLabel: "Remove link" }))
                            run(() => setDependency(task.id, d.id, false));
                        }}
                      >
                        <X />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {perms.canManage && otherTasks.length > 0 && (
                <NativeSelect
                  aria-label="Add a task this one waits for"
                  value=""
                  onChange={(e) => e.target.value && run(() => setDependency(task.id, e.target.value, true))}
                >
                  <option value="">+ Add a task this one waits for…</option>
                  {otherTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </NativeSelect>
              )}
              {detail.blocking.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Other tasks waiting for this one: {detail.blocking.map((b) => byId.get(b.id)?.title ?? b.title).join(", ")}
                </p>
              )}
            </Section>

            {/* Checklist */}
            <Section title={`Checklist${detail.checklist.length ? ` (${detail.checklist.filter((c) => c.is_done).length}/${detail.checklist.length})` : ""}`}>
              <ul className="grid gap-1">
                {detail.checklist.map((c) => (
                  <li key={c.id} className="group flex items-center gap-1">
                    <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={c.is_done}
                        disabled={!perms.canEdit || pending}
                        onChange={(e) => run(() => updateChecklistItem(c.id, { is_done: e.target.checked }))}
                        className="size-5 accent-[var(--primary)]"
                      />
                      <span className={cn("text-sm", c.is_done && "text-muted-foreground line-through")}>{c.title}</span>
                    </label>
                    {perms.canEdit && (
                      <Button variant="ghost" size="icon" aria-label={`Remove ${c.title}`} onClick={async () => {
                          if (await confirm(`Remove the step “${c.title}”?`, { confirmLabel: "Remove" })) run(() => deleteChecklistItem(c.id));
                        }}
                      >
                        <X />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {perms.canEdit && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (checkItem.trim()) run(() => addChecklistItem({ task_id: task.id, title: checkItem }), () => setCheckItem(""));
                  }}
                >
                  <Input value={checkItem} onChange={(e) => setCheckItem(e.target.value)} placeholder="Add an item" aria-label="New checklist item" maxLength={300} />
                  <Button type="submit" variant="outline" size="icon" aria-label="Add item" disabled={!checkItem.trim() || pending}>
                    <Plus />
                  </Button>
                </form>
              )}
            </Section>

            {/* Files */}
            <Section
              title="Files"
              action={
                perms.canEdit && (
                  <>
                    <input ref={fileInput} type="file" multiple className="sr-only" tabIndex={-1} aria-label="Choose files to attach" id={`files-${task.id}`} onChange={(e) => upload(e.target.files)} />
                    <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={!!uploading}>
                      {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
                      {uploading ? "Uploading…" : "Add files"}
                    </Button>
                  </>
                )
              }
            >
              {detail.attachments.length === 0 && <p className="text-sm text-muted-foreground">No files yet.</p>}
              <ul className="grid gap-1">
                {detail.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg border px-3 py-1">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate py-2 text-sm text-primary hover:underline">
                      {a.file_name}
                    </a>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{a.size_bytes ? `${Math.max(1, Math.round(a.size_bytes / 1024))} KB` : ""}</span>
                    {/* A real link, opened straight from the tap: iPhones block windows opened after a wait. */}
                    <Button asChild variant="ghost" size="icon">
                      <a href={`/api/attachments/${a.id}?download=1`} target="_blank" rel="noopener" aria-label={`Download ${a.file_name}`}>
                        <Download />
                      </a>
                    </Button>
                    {(perms.canManage || a.uploaded_by === perms.meId) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${a.file_name}`}
                        onClick={async () => {
                          if (await confirm(`Delete ${a.file_name}?`)) run(() => deleteAttachment(a.id));
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Section>

            {/* Internal notes */}
            {perms.canEdit && (
              <Section title="Internal notes">
                <AutoSaveText
                  multiline
                  label="Internal notes"
                  value={detail.task.internal_notes ?? ""}
                  placeholder="Notes for the team. Hidden from client exports."
                  onSave={(v) => saveField({ internal_notes: v || null })}
                  className="min-h-20"
                />
              </Section>
            )}

            {/* Comments */}
            <Section title={`Comments${detail.comments.length ? ` (${detail.comments.length})` : ""}`}>
              <ul className="grid gap-3">
                {detail.comments.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <UserAvatar person={c.author} src={board.members.find((m) => m.user_id === c.author_id)?.avatar_src} size={32} />
                    <div className="min-w-0 flex-1 rounded-xl bg-muted/60 px-3 py-2">
                      <p className="flex items-center gap-2 text-sm">
                        <span className="font-semibold">{fullName(c.author)}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                        {c.author_id === perms.meId && (
                          <button
                            type="button"
                            className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              if (await confirm("Delete this comment?")) run(() => deleteComment(c.id));
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {perms.canEdit ? (
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (comment.trim()) run(() => addComment({ task_id: task.id, body: comment }), () => setComment(""));
                  }}
                >
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment" aria-label="Write a comment" className="min-h-11" rows={2} maxLength={8000} />
                  <Button type="submit" size="icon" aria-label="Send comment" disabled={!comment.trim() || pending}>
                    <Send />
                  </Button>
                </form>
              ) : (
                detail.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments.</p>
              )}
            </Section>

            {/* History: who changed what (kept even if the task is deleted and restored) */}
            <Section title="History">
              <ul className="grid gap-2 text-sm">
                {detail.activity.map((a) => (
                  <li key={a.id} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{a.actor_id ? fullName(a.actor) : "System"}</span>{" "}
                    {a.action === "task.created"
                      ? "created this task"
                      : a.action === "task.restored"
                        ? "restored this task from the recycle bin"
                        : a.action === "task.variation"
                          ? `created variation ${String((a.changes as Record<string, unknown>).variation ?? "")} (client change)`
                        : a.action === "task.assigned"
                          ? `assigned ${String((a.changes as Record<string, unknown>).person ?? "someone")}`
                          : a.action === "task.unassigned"
                            ? `removed ${String((a.changes as Record<string, unknown>).person ?? "someone")}`
                            : Object.entries(a.changes)
                                .filter(([, change]) => Array.isArray(change))
                                .map(([field, change]) => describeChange(field, change, lookup))
                                .join(", ")}{" "}
                    · {timeAgo(a.created_at)}
                  </li>
                ))}
                {detail.activity.length === 0 && <li className="text-muted-foreground">No changes yet.</li>}
              </ul>
            </Section>

            <div className="flex flex-wrap gap-2">
            {perms.canEdit && (
              <>
                <Button variant="outline" onClick={() => setInsert("above")}>
                  <ArrowUpToLine aria-hidden /> Insert task above
                </Button>
                <Button variant="outline" onClick={() => setInsert("below")}>
                  <ArrowDownToLine aria-hidden /> Insert task below
                </Button>
                {(() => {
                  const siblings = groupTasks;
                  const i = siblings.findIndex((t) => t.id === task.id);
                  return (
                    <>
                      <Button variant="outline" disabled={i <= 0} onClick={() => void moveTask(task.id, task.group_id, siblings[i - 1].id)}>
                        <ArrowUp aria-hidden /> Move up
                      </Button>
                      <Button variant="outline" disabled={i === -1 || i >= siblings.length - 1} onClick={() => void moveTask(task.id, task.group_id, siblings[i + 2]?.id ?? null)}>
                        <ArrowDown aria-hidden /> Move down
                      </Button>
                    </>
                  );
                })()}
              </>
            )}
            {perms.canManage && (
              <Button variant="outline" onClick={() => setVariationOpen(true)}>
                <FileDiff aria-hidden /> Client change → Variation
              </Button>
            )}
            {perms.canEdit && (
              <>
                <Button variant="outline" onClick={() => setDuplicateOpen(true)}>
                  <CopyPlus aria-hidden /> Duplicate
                </Button>
                <Button variant="outline" onClick={() => setCopyOpen(true)}>
                  <Copy aria-hidden /> Copy to other projects
                </Button>
              </>
            )}
            {perms.canManage && (
              <Button
                variant="outline"
                className="justify-self-start text-destructive"
                onClick={async () => {
                  if (!(await confirm(`Delete “${task.title}”?`, {
                      body: "Its checklist, comments and files go too. An administrator can restore it from the Recycle bin for 30 days.",
                    }))) return;
                  const res = await deleteTask(task.id);
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success("Task deleted");
                    openTask(null);
                  }
                }}
              >
                <Trash2 aria-hidden /> Delete task
              </Button>
            )}
            </div>
          </>
        )}
      </div>
      {insert && <InsertTaskDialog anchor={task} where={insert} onClose={() => setInsert(null)} />}
      {perms.canManage && variationOpen && <VariationDialog source={task} onClose={() => setVariationOpen(false)} />}
      {perms.canEdit && duplicateOpen && <DuplicateTaskDialog task={task} open onClose={() => setDuplicateOpen(false)} />}
      {perms.canEdit && (
        <CopyTaskDialog task={task} groupName={board.groups.find((g) => g.id === task.group_id)?.name ?? ""} open={copyOpen} onClose={() => setCopyOpen(false)} />
      )}
      {dialog}
    </div>
  );
}

export function TaskDrawer() {
  const { openTaskId, byId, openTask } = useBoard();
  const task = openTaskId ? byId.get(openTaskId) : undefined;
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && openTask(null)}>
      {task && (
        <SheetContent
          title={task.title}
          description="Task details"
          onOpenAutoFocus={(e) => {
            // Keep focus on the panel itself rather than jumping into the first field.
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
        >
          <DrawerBody key={task.id} task={task} />
        </SheetContent>
      )}
    </Sheet>
  );
}
