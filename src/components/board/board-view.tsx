"use client";

import {
  DndContext,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, ChevronDown, ChevronRight, CheckSquare, GripVertical, MessageSquare, MoreHorizontal, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createGroup, createTask, deleteGroup, moveGroup, updateGroup } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { RiskIcon } from "@/components/health-badge";
import { DUE_STYLES, dueState, filterTasks, filtersActive, shortDate } from "@/lib/board";
import { cn } from "@/lib/utils";
import type { BoardTask, BuiltinColumn, CustomColumn, Group } from "@/types/board";
import { useBoard } from "./board-context";
import { AvatarStack, DateCell, DependencyCell, OwnerPicker, PriorityPicker, ProgressCell, StatusPicker, RepeatMark, InternalMark } from "./cells";
import { FilterBar } from "./filter-bar";

// ---------------------------------------------------------------------------
// Column layout (desktop table)
// ---------------------------------------------------------------------------

const BUILTIN_META: Record<BuiltinColumn, { label: string; width: string }> = {
  status: { label: "Status", width: "140px" },
  owners: { label: "Owners", width: "110px" },
  priority: { label: "Priority", width: "120px" },
  start_date: { label: "Start", width: "100px" },
  due_date: { label: "Due", width: "100px" },
  progress: { label: "Progress", width: "140px" },
  dependencies: { label: "Waiting for", width: "120px" },
};

function useColumns() {
  const { board } = useBoard();
  const builtins = (Object.keys(BUILTIN_META) as BuiltinColumn[]).filter((c) => !board.project.hidden_columns.includes(c));
  const template = ["minmax(260px,1fr)", ...builtins.map((c) => BUILTIN_META[c].width), ...board.columns.map(() => "150px")].join(" ");
  return { builtins, custom: board.columns, template };
}

function CustomValueCell({ task, column }: { task: BoardTask; column: CustomColumn }) {
  const { patchTask, perms, openTask } = useBoard();
  const value = task.custom_values?.[column.id];
  const [draft, setDraft] = useState<string | null>(null);

  if (column.kind === "file") {
    return (
      <button type="button" onClick={() => openTask(task.id)} className="flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent">
        <Paperclip className="size-4" aria-hidden /> {task.attachment_count || "Add"}
      </button>
    );
  }
  if (!perms.canEdit) return <span className="truncate px-2 text-sm">{value ?? ""}</span>;
  const shown = draft ?? (value === null || value === undefined ? "" : String(value));
  const save = () => {
    if (draft === null) return;
    const v = column.kind === "number" ? (draft.trim() === "" ? null : Number(draft)) : draft.trim() || null;
    if (column.kind === "number" && v !== null && Number.isNaN(v)) {
      toast.error("Please enter a number.");
      setDraft(null);
      return;
    }
    setDraft(null);
    if (v !== (value ?? null)) void patchTask(task.id, { custom_values: { [column.id]: v } });
  };
  return (
    <input
      aria-label={column.name}
      value={shown}
      inputMode={column.kind === "number" ? "decimal" : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(null);
      }}
      className="h-11 w-full rounded-lg bg-transparent px-2 text-sm hover:bg-accent focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function TaskBadges({ task }: { task: BoardTask }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      <InternalMark task={task} />
      <RepeatMark task={task} />
      {task.checklist_total > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Checklist">
          <CheckSquare className="size-3.5" aria-hidden />
          {task.checklist_done}/{task.checklist_total}
        </span>
      )}
      {task.comment_count > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Comments">
          <MessageSquare className="size-3.5" aria-hidden />
          {task.comment_count}
        </span>
      )}
      {task.attachment_count > 0 && (
        <span className="inline-flex items-center gap-0.5" title="Files">
          <Paperclip className="size-3.5" aria-hidden />
          {task.attachment_count}
        </span>
      )}
    </span>
  );
}

/** Drag a task by its handle; drop it on another task to place it there. */
function useTaskDrag(task: BoardTask, layout: "row" | "card") {
  const { perms } = useBoard();
  const enabled = perms.canEdit;
  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    // Rows (computers) and cards (phones) both exist on the page, one hidden: they need separate ids.
    id: `task:${layout}:${task.id}`,
    data: { taskId: task.id, groupId: task.group_id },
    disabled: !enabled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `over:${layout}:${task.id}`, data: { taskId: task.id, groupId: task.group_id }, disabled: !enabled });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, position: "relative", zIndex: 30, boxShadow: "0 10px 25px rgb(0 0 0 / 0.15)" }
    : {};
  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };
  return { enabled, setRef, handle: { attributes, listeners, setActivatorNodeRef }, style, over: isOver && !isDragging };
}

function DragHandle({
  title,
  attributes,
  listeners,
  setActivatorNodeRef,
}: { title: string } & ReturnType<typeof useTaskDrag>["handle"]) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`Move ${title.startsWith("group ") ? title : `“${title}”`} (drag, or press space then use the arrow keys)`}
      className="flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

function TaskRow({ task, color }: { task: BoardTask; color: string }) {
  const { openTask, risks } = useBoard();
  const risk = risks.get(task.id);
  const { builtins, custom, template } = useColumns();
  const { enabled, setRef, handle, style, over } = useTaskDrag(task, "row");
  const { attributes, listeners, setActivatorNodeRef } = handle;
  return (
    <div
      role="row"
      ref={setRef}
      className={cn("grid items-center border-b bg-card hover:bg-accent/40", over && "shadow-[inset_0_3px_0_0_var(--color-primary)]")}
      style={{ gridTemplateColumns: template, ...style }}
    >
      <div role="cell" className="sticky left-0 z-10 flex h-12 min-w-0 items-center gap-1 bg-inherit pl-1 pr-2" style={{ boxShadow: `inset 4px 0 0 ${color}` }}>
        {enabled && <DragHandle title={task.title} attributes={attributes} listeners={listeners} setActivatorNodeRef={setActivatorNodeRef} />}
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className={cn("min-w-0 flex-1 truncate rounded text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !enabled && "ml-2", task.completed_at && "text-muted-foreground line-through")}
        >
          {task.title}
        </button>
        {risk && <RiskIcon level={risk.level} reason={risk.reason} />}
        <TaskBadges task={task} />
      </div>
      {builtins.map((c) => (
        <div role="cell" key={c} className="flex items-center justify-center px-1">
          {c === "status" && <StatusPicker task={task} full />}
          {c === "owners" && <OwnerPicker task={task} />}
          {c === "priority" && <PriorityPicker task={task} />}
          {c === "start_date" && <DateCell task={task} field="start_date" />}
          {c === "due_date" && <DateCell task={task} field="due_date" />}
          {c === "progress" && <ProgressCell task={task} />}
          {c === "dependencies" && <DependencyCell task={task} />}
        </div>
      ))}
      {custom.map((col) => (
        <div role="cell" key={col.id} className="px-1">
          <CustomValueCell task={task} column={col} />
        </div>
      ))}
    </div>
  );
}

/** Phone layout: one card per task. Tap opens the task; status is one tap away. */
function TaskCard({ task, color }: { task: BoardTask; color: string }) {
  const { openTask, membersById, risks } = useBoard();
  const risk = risks.get(task.id);
  const state = dueState(task.due_date, !!task.completed_at);
  const { enabled, setRef, handle, style, over } = useTaskDrag(task, "card");
  const { attributes, listeners, setActivatorNodeRef } = handle;
  return (
    <li
      ref={setRef}
      className={cn("relative overflow-hidden rounded-xl border bg-card", over && "ring-2 ring-primary")}
      style={{ boxShadow: `inset 4px 0 0 ${color}`, ...style }}
    >
      {enabled && (
        <span className="absolute right-1 top-1">
          <DragHandle title={task.title} attributes={attributes} listeners={listeners} setActivatorNodeRef={setActivatorNodeRef} />
        </span>
      )}
      <button type="button" onClick={() => openTask(task.id)} className={cn("block w-full px-4 pb-2 pt-3 text-left", enabled && "pr-10")}>
        <span className={cn("block font-medium", task.completed_at && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {task.due_date && <span className={DUE_STYLES[state]}>{state === "overdue" ? "Overdue · " : "Due "}{shortDate(task.due_date)}</span>}
          <span className={cn("font-semibold tabular-nums", task.completed_at ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>{task.completed_at ? 100 : task.progress}%</span>
          <TaskBadges task={task} />
        </span>
        {risk && risk.reason !== "Overdue" && (
          <span className="mt-1 block">
            <RiskIcon level={risk.level} reason={risk.reason} withText />
          </span>
        )}
      </button>
      <div className="flex items-center gap-3 px-4 pb-3">
        <StatusPicker task={task} className="flex-1" full />
        {task.assignees.length > 0 && <AvatarStack ids={task.assignees} members={membersById} size={30} />}
      </div>
      {task.progress > 0 && !task.completed_at && (
        <div className="h-1 bg-muted">
          <div className="h-full bg-success" style={{ width: `${task.progress}%` }} />
        </div>
      )}
    </li>
  );
}

/** A group on the board; managers can drag it by its header handle. */
function GroupSection({ group, children }: { group: Group; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { perms } = useBoard();
  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: `group:${group.id}`,
    data: { kind: "group", groupId: group.id },
    disabled: !perms.canManage,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `groupdrop:${group.id}`, data: { kind: "group", groupId: group.id, taskId: null }, disabled: !perms.canManage });
  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, position: "relative", zIndex: 40, opacity: 0.9 }
    : {};
  return (
    <section ref={setRef} aria-label={group.name} className={cn("min-w-0 rounded-xl", isOver && !isDragging && "ring-2 ring-primary ring-offset-4 ring-offset-background")} style={style}>
      {children(
        perms.canManage ? (
          <DragHandle title={`group “${group.name}”`} attributes={attributes} listeners={listeners} setActivatorNodeRef={setActivatorNodeRef} />
        ) : null,
      )}
    </section>
  );
}

/** Drop here to move a task to the end of this group. */
function GroupEndDrop({ group, layout, children }: { group: Group; layout: "row" | "card"; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `end:${layout}:${group.id}`, data: { groupId: group.id, taskId: null } });
  return (
    <div ref={setNodeRef} className={cn(isOver && "bg-primary/5 shadow-[inset_0_3px_0_0_var(--color-primary)]")}>
      {children}
    </div>
  );
}

function AddTaskRow({ group }: { group: Group }) {
  const { board } = useBoard();
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const submit = () => {
    const t = title.trim();
    if (!t) return;
    start(async () => {
      const res = await createTask({ project_id: board.project.id, group_id: group.id, title: t });
      if (!res.ok) toast.error(res.error);
      else setTitle("");
    });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 px-2 py-2"
    >
      <Plus className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task"
        aria-label={`Add a task to ${group.name}`}
        className="h-10 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-input"
        disabled={pending}
        maxLength={300}
      />
      {title.trim() && (
        <Button type="submit" size="sm" disabled={pending}>
          Add
        </Button>
      )}
    </form>
  );
}

function GroupHeader({
  group,
  count,
  pct,
  collapsed,
  onToggle,
  handle,
}: {
  group: Group;
  count: number;
  pct: number | null;
  collapsed: boolean;
  onToggle: () => void;
  /** Managers: the handle to drag the whole group by. */
  handle?: React.ReactNode;
}) {
  const { perms, board } = useBoard();
  const isFirst = board.groups[0]?.id === group.id;
  const isLast = board.groups[board.groups.length - 1]?.id === group.id;
  const { confirm, dialog } = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);

  const rename = async () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== group.name) {
      const res = await updateGroup(group.id, { name: name.trim() });
      if (!res.ok) toast.error(res.error);
    } else setName(group.name);
  };

  return (
    <div className="flex items-center gap-1 py-2">
      {handle}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Show" : "Hide"} ${group.name}`}
        className="flex size-11 items-center justify-center rounded-lg hover:bg-accent"
        style={{ color: group.color }}
      >
        {collapsed ? <ChevronRight className="size-5" /> : <ChevronDown className="size-5" />}
      </button>
      {renaming ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-10 max-w-xs font-semibold"
          aria-label="Group name"
        />
      ) : (
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="size-3 shrink-0 rounded-sm" style={{ background: group.color }} aria-hidden />
          {group.name}
        </h2>
      )}
      <span className="ml-1 text-sm text-muted-foreground">
        {count} {count === 1 ? "task" : "tasks"}
        {pct !== null && (
          <>
            {" · "}
            <span className={cn("font-semibold tabular-nums", pct === 100 ? "text-emerald-700 dark:text-emerald-400" : "text-foreground")}>{pct}%</span> complete
          </>
        )}
      </span>
      {perms.canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Options for ${group.name}`} className="ml-auto md:ml-1">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            {(
              [
                { to: "top", label: "Move to top", icon: ArrowUpToLine, disabled: isFirst },
                { to: "up", label: "Move up", icon: ArrowUp, disabled: isFirst },
                { to: "down", label: "Move down", icon: ArrowDown, disabled: isLast },
                { to: "bottom", label: "Move to bottom", icon: ArrowDownToLine, disabled: isLast },
              ] as const
            ).map(({ to, label, icon: Icon, disabled }) => (
              <DropdownMenuItem
                key={to}
                disabled={disabled}
                onSelect={async () => {
                  const res = await moveGroup(group.id, to);
                  if (!res.ok) toast.error(res.error);
                }}
              >
                <Icon /> {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              destructive
              onSelect={async () => {
                const ok = await confirm(`Delete “${group.name}”?`, {
                  body: count ? `This also deletes its ${count} ${count === 1 ? "task" : "tasks"}. This can't be undone.` : undefined,
                });
                if (!ok) return;
                const res = await deleteGroup(group.id);
                if (res.ok) toast.success(res.message ?? "Deleted");
                else toast.error(res.error);
              }}
            >
              <Trash2 /> Delete group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {dialog}
    </div>
  );
}

function AddGroup() {
  const { board } = useBoard();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add group
      </Button>
    );
  return (
    <form
      className="flex max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createGroup({ project_id: board.project.id, name });
          if (!res.ok) toast.error(res.error);
          else {
            setName("");
            setOpen(false);
          }
        });
      }}
    >
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. Phase 2" aria-label="New group name" />
      <Button type="submit" disabled={pending || !name.trim()}>
        Add
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------

/** The task under the finger / mouse is the drop target (keyboard dragging falls back to overlap). */
const dropUnderPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function BoardView() {
  const { board, tasks, filters, perms, moveTask } = useBoard();
  // Mouse: drag after moving 6px. Touch: press and hold the handle briefly, so swiping still scrolls.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  // Group order shown on screen (changes instantly when a group is dragged, then saves).
  const [groupOrder, setGroupOrder] = useState<string[] | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh server data replaces the local order
  useEffect(() => setGroupOrder(null), [board.groups]);
  const groups = groupOrder ? groupOrder.map((id) => board.groups.find((g) => g.id === id)!).filter(Boolean) : board.groups;

  const onDragEnd = (e: DragEndEvent) => {
    if (e.active.data.current?.kind === "group") {
      const groupId = e.active.data.current.groupId as string;
      const targetGroup = e.over?.data.current?.groupId as string | undefined;
      if (!targetGroup || targetGroup === groupId) return;
      const ids = groups.map((g) => g.id);
      const from = ids.indexOf(groupId);
      const to = ids.indexOf(targetGroup);
      // Dropped on a group below → goes after it; above → before it.
      const before = from < to ? (ids[to + 1] ?? null) : targetGroup;
      const next = ids.filter((id) => id !== groupId);
      const at = before ? next.indexOf(before) : next.length;
      next.splice(at, 0, groupId);
      setGroupOrder(next);
      void moveGroup(groupId, { before }).then((res) => {
        if (!res.ok) {
          setGroupOrder(null);
          toast.error(res.error);
        }
      });
      return;
    }
    const taskId = e.active.data.current?.taskId as string | undefined;
    const target = e.over?.data.current as { taskId: string | null; groupId: string } | undefined;
    if (!taskId || !target || target.taskId === taskId) return;
    let before = target.taskId;
    if (before) {
      // Dragging down within the same group places it after the task it's dropped on.
      const inGroup = tasks.filter((t) => t.group_id === target.groupId);
      const from = inGroup.findIndex((t) => t.id === taskId);
      const to = inGroup.findIndex((t) => t.id === before);
      if (from !== -1 && from < to) before = inGroup[to + 1]?.id ?? null;
    }
    void moveTask(taskId, target.groupId, before);
  };
  const { builtins, custom, template } = useColumns();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const visible = useMemo(() => filterTasks(tasks, filters, perms.meId), [tasks, filters, perms.meId]);
  const filtering = filtersActive(filters);

  return (
    <>
      <FilterBar />
      {board.groups.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          This project has no groups yet.{perms.canManage ? " Add one to start adding tasks." : ""}
        </p>
      )}
      <DndContext id="board-dnd" sensors={sensors} collisionDetection={dropUnderPointer} onDragEnd={onDragEnd}>
      <div className="grid min-w-0 gap-6">
        {groups.map((g) => {
          const groupTasks = visible.filter((t) => t.group_id === g.id);
          if (filtering && groupTasks.length === 0) return null;
          const isCollapsed = collapsed[g.id] ?? false;
          return (
            <GroupSection key={g.id} group={g}>
              {(groupHandle) => (
              <>
              <GroupHeader
                group={g}
                handle={groupHandle}
                count={groupTasks.length}
                pct={groupTasks.length ? Math.round(groupTasks.reduce((n, t) => n + (t.completed_at ? 100 : t.progress), 0) / groupTasks.length) : null}
                collapsed={isCollapsed} onToggle={() => setCollapsed((c) => ({ ...c, [g.id]: !isCollapsed }))} />
              {!isCollapsed && (
                <>
                  {/* Desktop / tablet: table */}
                  <div className="hidden overflow-x-auto rounded-xl border md:block">
                    <div role="table" aria-label={`${g.name} tasks`} className="min-w-max">
                      <div role="row" className="grid border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground" style={{ gridTemplateColumns: template }}>
                        <div role="columnheader" className="sticky left-0 bg-muted/60 px-4 py-2.5" style={{ boxShadow: `inset 4px 0 0 ${g.color}` }}>
                          Task
                        </div>
                        {builtins.map((c) => (
                          <div role="columnheader" key={c} className="px-2 py-2.5 text-center">
                            {BUILTIN_META[c].label}
                          </div>
                        ))}
                        {custom.map((c) => (
                          <div role="columnheader" key={c.id} className="truncate px-2 py-2.5">
                            {c.name}
                          </div>
                        ))}
                      </div>
                      {groupTasks.map((t) => (
                        <TaskRow key={t.id} task={t} color={g.color} />
                      ))}
                    </div>
                    {perms.canEdit && (
                      <GroupEndDrop group={g} layout="row">
                        <AddTaskRow group={g} />
                      </GroupEndDrop>
                    )}
                  </div>
                  {/* Phones: cards */}
                  <div className="md:hidden">
                    <ul className="grid gap-2">
                      {groupTasks.map((t) => (
                        <TaskCard key={t.id} task={t} color={g.color} />
                      ))}
                    </ul>
                    {perms.canEdit && (
                      <div className="mt-2 overflow-hidden rounded-xl border border-dashed">
                        <GroupEndDrop group={g} layout="card">
                          <AddTaskRow group={g} />
                        </GroupEndDrop>
                      </div>
                    )}
                  </div>
                  {groupTasks.length === 0 && !perms.canEdit && <p className="px-3 text-sm text-muted-foreground">No tasks.</p>}
                </>
              )}
              </>
              )}
            </GroupSection>
          );
        })}
      </div>
      </DndContext>
      {filtering && visible.length === 0 && <p className="mt-6 text-center text-muted-foreground">No tasks match these filters.</p>}
      {perms.canManage && (
        <div className="mt-6">
          <AddGroup />
        </div>
      )}
    </>
  );
}
