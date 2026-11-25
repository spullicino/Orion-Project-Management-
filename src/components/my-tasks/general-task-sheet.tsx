"use client";

import { Briefcase, Check, FolderKanban, Loader2, MessageSquare, Plus, Search, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addGeneralTaskComment,
  createGeneralTask,
  createProjectTaskQuick,
  deleteGeneralTask,
  loadGeneralTaskComments,
  setGeneralTaskAssignees,
  updateGeneralTask,
} from "@/app/(app)/my-tasks/general-actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { PRIORITIES } from "@/lib/board";
import { cn, formatDate, fullName, readableTextOn } from "@/lib/utils";
import type { Priority } from "@/types/board";
import type { AppRole } from "@/types/database";
import { GENERAL_STATUSES, type ChecklistItem, type GeneralStatus, type GeneralTask, type GeneralTaskComment } from "@/types/general-tasks";

export type PickPerson = { id: string; name: string; role: AppRole };
export type PickClient = { id: string; name: string };
export type PickProject = { id: string; name: string; groups: { id: string; name: string }[]; memberIds: string[] };

const timeOf = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));

function PeoplePicker({ people, value, onChange }: { people: PickPerson[]; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    return w ? people.filter((p) => p.name.toLowerCase().includes(w)) : people;
  }, [people, q]);
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a colleague" aria-label="Find a colleague" className="pl-9" />
      </div>
      <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border p-1">
        {shown.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={value.includes(p.id)}
                onChange={() => onChange(value.includes(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id])}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[p.role]}</span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="p-3 text-sm text-muted-foreground">Nobody matches.</li>}
      </ul>
    </div>
  );
}

/** Create (task = null) or open a general task — not linked to any project. */
export function GeneralTaskSheet({
  task,
  open,
  onClose,
  onChanged,
  me,
  people,
  clients,
  projects = [],
}: {
  task: GeneralTask | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  me: { id: string; role: AppRole };
  people: PickPerson[];
  clients: PickClient[];
  projects?: PickProject[];
}) {
  const router = useRouter();
  const creating = !task;
  const isManagerPlus = me.role === "admin" || me.role === "manager";
  const canManage = creating ? isManagerPlus : me.role === "admin" || (task.created_by === me.id && isManagerPlus);
  const { confirm, dialog } = useConfirm();

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [clientId, setClientId] = useState(task?.client?.id ?? "");
  const [due, setDue] = useState(task?.due_date ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [assignees, setAssignees] = useState<string[]>(task?.assignees.map((a) => a.id) ?? []);
  const [status, setStatus] = useState<GeneralStatus>(task?.status ?? "not_started");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const [comments, setComments] = useState<GeneralTaskComment[] | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingPeople, setEditingPeople] = useState(creating);
  // New task only: put it in a project (a normal project task) or keep it General.
  const [projectId, setProjectId] = useState("");
  const [groupId, setGroupId] = useState("");
  const project = projects.find((p) => p.id === projectId) ?? null;
  const pickable = project ? people.filter((p) => project.memberIds.includes(p.id)) : people;
  const chooseProject = (id: string) => {
    const next = projects.find((p) => p.id === id) ?? null;
    setProjectId(id);
    setGroupId(next?.groups[0]?.id ?? "");
    if (next) setAssignees((a) => a.filter((x) => next.memberIds.includes(x)));
  };

  useEffect(() => {
    if (!task || !open) return;
    let alive = true;
    void loadGeneralTaskComments(task.id).then((res) => alive && res.ok && setComments(res.data ?? []));
    return () => {
      alive = false;
    };
  }, [task, open]);

  const detailsChanged =
    !!task &&
    (title !== task.title ||
      description !== (task.description ?? "") ||
      clientId !== (task.client?.id ?? "") ||
      due !== (task.due_date ?? "") ||
      priority !== task.priority ||
      assignees.slice().sort().join() !== task.assignees.map((a) => a.id).sort().join());

  const saveStatus = async (s: GeneralStatus) => {
    if (!task) return setStatus(s);
    const prev = status;
    setStatus(s);
    const res = await updateGeneralTask(task.id, { status: s });
    if (!res.ok) {
      setStatus(prev);
      return void toast.error(res.error);
    }
    if (s === "done") toast.success("Nice work! Task marked as done.");
    onChanged();
  };
  const saveChecklist = async (next: ChecklistItem[]) => {
    const prev = checklist;
    setChecklist(next);
    if (!task) return;
    const res = await updateGeneralTask(task.id, { checklist: next });
    if (!res.ok) {
      setChecklist(prev);
      toast.error(res.error);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (creating && project) {
        const res = await createProjectTaskQuick({ project_id: project.id, group_id: groupId, title, description: description || null, due_date: due || null, priority, assignee_ids: assignees });
        if (!res.ok) return void toast.error(res.error);
        const opened = res.data!;
        toast.success(`Task added to ${project.name}`, { action: { label: "Open", onClick: () => router.push(`/projects/${opened.project_id}/board?task=${opened.id}`) } });
      } else if (creating) {
        const res = await createGeneralTask({ title, description: description || null, client_id: clientId || null, due_date: due || null, priority, assignee_ids: assignees });
        if (!res.ok) return void toast.error(res.error);
        toast.success(`Task given to ${assignees.length} ${assignees.length === 1 ? "person" : "people"}`);
      } else {
        const res = await updateGeneralTask(task.id, { title, description: description || null, client_id: clientId || null, due_date: due || null, priority });
        if (!res.ok) return void toast.error(res.error);
        if (assignees.slice().sort().join() !== task.assignees.map((a) => a.id).sort().join()) {
          const r2 = await setGeneralTaskAssignees(task.id, assignees);
          if (!r2.ok) return void toast.error(r2.error);
        }
        toast.success("Task saved");
        setEditingPeople(false);
      }
      onChanged();
      if (creating) onClose();
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string) => {
    const a = task?.assignees.find((x) => x.id === id);
    return people.find((p) => p.id === id)?.name ?? (a ? fullName(a) : "");
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent title={creating ? "New task" : task.title} description={creating ? "Add a task to a project, or a general task not linked to one" : "A task not linked to any project"}>
        {dialog}
        <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-5 pb-6 pt-4 md:pt-6">
          <div className="flex flex-wrap items-center gap-2 pr-10 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              {project ? <FolderKanban className="size-3.5" aria-hidden /> : <Briefcase className="size-3.5" aria-hidden />} {creating ? (project ? "New project task" : "New general task") : "General task"}
            </span>
            {task?.client && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">Client: {task.client.name}</span>}
          </div>

          {canManage ? (
            <label className="grid gap-1 text-sm font-medium">
              What needs doing?
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="e.g. Chase ABC Ltd for an update on the tender" autoFocus={creating} />
            </label>
          ) : (
            <h2 className="text-xl font-semibold leading-snug">{task?.title}</h2>
          )}

          {creating && projects.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1 text-sm font-medium">
                Project
                <NativeSelect value={projectId} onChange={(e) => chooseProject(e.target.value)}>
                  <option value="">No project — general task</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {project && (
                <label className="grid min-w-0 gap-1 text-sm font-medium">
                  Group
                  <NativeSelect value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                    {project.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
            </div>
          )}

          {!creating && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Status</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GENERAL_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={status === s.value}
                    onClick={() => void saveStatus(s.value)}
                    className={cn("flex h-11 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-semibold", status !== s.value && "bg-card hover:bg-accent")}
                    style={status === s.value ? { background: s.color, borderColor: s.color, color: readableTextOn(s.color) } : undefined}
                  >
                    {status === s.value && <Check className="size-4" aria-hidden />}
                    {s.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Assigned to</span>
              {canManage && !creating && (
                <Button variant="ghost" size="sm" onClick={() => setEditingPeople((v) => !v)}>
                  {editingPeople ? "Done choosing" : "Change"}
                </Button>
              )}
            </div>
            {editingPeople && canManage ? (
              <>
                {project && <p className="text-xs text-muted-foreground">Only people on {project.name} are listed{assignees.length ? "" : " — you can also leave it unassigned"}. Add people in the project&apos;s Settings.</p>}
                <PeoplePicker people={pickable} value={assignees} onChange={setAssignees} />
              </>
            ) : (
              <p className="text-sm">{assignees.map(nameOf).filter(Boolean).join(", ") || "Nobody yet"}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Due date
              {canManage ? <Input type="date" value={due} placeholder="No due date" onChange={(e) => setDue(e.target.value)} /> : <span className="font-normal">{due ? formatDate(due) : "No due date"}</span>}
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Priority
              {canManage ? (
                <NativeSelect value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <span className="font-normal">{PRIORITIES.find((p) => p.value === priority)?.label}</span>
              )}
            </label>
          </div>

          {canManage && !project ? (
            <label className="grid gap-1 text-sm font-medium">
              Client (optional)
              <NativeSelect value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ) : null}

          {canManage ? (
            <label className="grid gap-1 text-sm font-medium">
              Details (optional)
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={8000} placeholder="e.g. Call Mr Borg, ask if they reviewed our revised price." />
            </label>
          ) : (
            task?.description && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm">{task.description}</p>
          )}

          {canManage && (creating || detailsChanged) && (
            <Button size="lg" disabled={busy || !title.trim() || (project ? !groupId : !assignees.length)} onClick={() => void submit()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : creating ? <Send aria-hidden /> : <Check aria-hidden />}{" "}
              {creating ? (project ? "Add to project" : "Create and assign") : "Save changes"}
            </Button>
          )}

          {!creating && (
            <>
              <section className="grid gap-2" aria-labelledby="gt-checklist">
                <h3 id="gt-checklist" className="text-sm font-medium">
                  Checklist {checklist.length > 0 && <span className="font-normal text-muted-foreground">({checklist.filter((c) => c.done).length}/{checklist.length})</span>}
                </h3>
                <ul className="grid gap-1">
                  {checklist.map((c, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent">
                        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={c.done} onChange={() => void saveChecklist(checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
                        <span className={cn("min-w-0 break-words text-sm", c.done && "text-muted-foreground line-through")}>{c.text}</span>
                      </label>
                      <Button variant="ghost" size="icon" aria-label={`Remove “${c.text}”`} onClick={async () => {
                          if (await confirm(`Remove the step “${c.text}”?`, { confirmLabel: "Remove" })) void saveChecklist(checklist.filter((_, j) => j !== i));
                        }}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newItem.trim()) return;
                    void saveChecklist([...checklist, { text: newItem.trim(), done: false }]);
                    setNewItem("");
                  }}
                >
                  <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a step" aria-label="Add a checklist step" maxLength={300} />
                  <Button type="submit" variant="outline" size="icon" aria-label="Add step" disabled={!newItem.trim()}>
                    <Plus />
                  </Button>
                </form>
              </section>

              <section className="grid gap-2" aria-labelledby="gt-comments">
                <h3 id="gt-comments" className="flex items-center gap-1.5 text-sm font-medium">
                  <MessageSquare className="size-4" aria-hidden /> Comments
                </h3>
                {comments === null ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No comments yet — e.g. “Called them, reply on Monday”.</p>
                ) : (
                  <ul className="grid gap-2">
                    {comments.map((c) => (
                      <li key={c.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                        <p className="mb-1 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{c.author_name}</span> · {timeOf(c.created_at)}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{c.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="flex items-end gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!comment.trim() || !task) return;
                    const res = await addGeneralTaskComment({ task_id: task.id, body: comment });
                    if (!res.ok) return void toast.error(res.error);
                    setComment("");
                    const list = await loadGeneralTaskComments(task.id);
                    if (list.ok) setComments(list.data ?? []);
                    onChanged();
                  }}
                >
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={4000} placeholder="Write a comment" aria-label="Write a comment" className="min-h-11" />
                  <Button type="submit" size="icon" aria-label="Send comment" disabled={!comment.trim()}>
                    <Send />
                  </Button>
                </form>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                <span>
                  Created by {task.creator_name} · {formatDate(task.created_at)}
                </span>
                {canManage && (
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      if (!(await confirm("Delete this task?", { body: "It disappears for everyone it was given to." }))) return;
                      const res = await deleteGeneralTask(task.id);
                      if (!res.ok) return void toast.error(res.error);
                      toast.success("Task deleted");
                      onChanged();
                      onClose();
                    }}
                  >
                    <Trash2 aria-hidden /> Delete task
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
