"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { DUE_STYLES, dueState, filterTasks, shortDate } from "@/lib/board";
import { cn } from "@/lib/utils";
import { readableTextOn } from "@/lib/utils";
import type { BoardTask, StatusLabel } from "@/types/board";
import { useBoard } from "./board-context";
import { RiskIcon } from "@/components/health-badge";
import { AvatarStack } from "./cells";
import { FilterBar } from "./filter-bar";

const NO_STATUS = "__none__";
/** Browsers fire a click right after a drag ends; ignore it so the card doesn't open. */
let lastDragEnd = 0;

function CardBody({ task, dragging }: { task: BoardTask; dragging?: boolean }) {
  const { board, membersById, risks } = useBoard();
  const risk = risks.get(task.id);
  const group = board.groups.find((g) => g.id === task.group_id);
  const state = dueState(task.due_date, !!task.completed_at);
  return (
    <div className={cn("rounded-xl border bg-card p-3 text-left shadow-sm", dragging && "rotate-2 shadow-xl ring-2 ring-primary")}>
      {group && (
        <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: group.color }} aria-hidden />
          {group.name}
        </span>
      )}
      <p className={cn("font-medium leading-snug", task.completed_at && "text-muted-foreground line-through")}>{task.title}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {risk && <RiskIcon level={risk.level} reason={risk.reason} />}
          <span className={cn("text-sm", DUE_STYLES[state])}>{task.due_date ? shortDate(task.due_date) : ""}</span>
        </span>
        {task.assignees.length > 0 && <AvatarStack ids={task.assignees} members={membersById} size={26} />}
      </div>
      {task.progress > 0 && !task.completed_at && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-success" style={{ width: `${task.progress}%` }} />
        </div>
      )}
    </div>
  );
}

function KanbanCard({ task }: { task: BoardTask }) {
  const { openTask, perms } = useBoard();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !perms.canEdit });
  return (
    <li className="list-none">
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (Date.now() - lastDragEnd > 300) openTask(task.id);
      }}
      onKeyDown={(e) => {
        // Enter opens; Space starts a keyboard drag (handled by dnd-kit).
        if (e.key === "Enter") openTask(task.id);
        listeners?.onKeyDown?.(e);
      }}
      aria-label={`${task.title}. Press Enter to open${perms.canEdit ? ", Space to move" : ""}.`}
      className={cn("cursor-pointer touch-manipulation rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isDragging && "opacity-30")}
    >
      <CardBody task={task} />
    </div>
    </li>
  );
}

function Column({ id, label, tasks }: { id: string; label: StatusLabel | null; tasks: BoardTask[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const color = label?.color ?? "#94a3b8";
  return (
    <section
      aria-label={label?.name ?? "No status"}
      className="flex w-[82vw] max-w-80 shrink-0 snap-start flex-col rounded-2xl bg-muted/60 sm:w-72 lg:w-auto lg:min-w-60 lg:max-w-none lg:flex-1"
    >
      <header className="flex items-center gap-2 rounded-t-2xl px-3 py-2.5 text-sm font-semibold" style={{ background: color, color: readableTextOn(color) }}>
        <span className="flex-1 truncate">{label?.name ?? "No status"}</span>
        <span className="rounded-full bg-black/10 px-2 text-xs">{tasks.length}</span>
      </header>
      <ul ref={setNodeRef} className={cn("flex min-h-32 flex-1 flex-col gap-2 p-2 transition-colors", isOver && "bg-primary/10")}>
        {tasks.map((t) => (
          <KanbanCard key={t.id} task={t} />
        ))}
        {tasks.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Drop tasks here</li>}
      </ul>
    </section>
  );
}

export function KanbanView() {
  const { board, tasks, filters, perms, patchTask, byId } = useBoard();
  const [activeId, setActiveId] = useState<string | null>(null);
  const visible = useMemo(() => filterTasks(tasks, filters, perms.meId), [tasks, filters, perms.meId]);

  // Mouse: drag after moving 6px. Touch: press and hold briefly, so swiping still scrolls the columns.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns: { id: string; label: StatusLabel | null }[] = [
    ...board.labels.map((l) => ({ id: l.id, label: l })),
    ...(visible.some((t) => !t.status_id) ? [{ id: NO_STATUS, label: null }] : []),
  ];

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    lastDragEnd = Date.now();
    setActiveId(null);
    const task = byId.get(String(e.active.id));
    const target = e.over?.id ? String(e.over.id) : null;
    if (!task || !target || target === NO_STATUS || target === task.status_id) return;
    void patchTask(task.id, { status_id: target });
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <>
      <FilterBar hideStatus />
      <p className="mb-3 text-sm text-muted-foreground md:hidden">
        Swipe to see more columns.{perms.canEdit ? " Press and hold a card to move it." : ""}
      </p>
      <DndContext id="kanban-board" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
          {columns.map((c) => (
            <Column key={c.id} id={c.id} label={c.label} tasks={visible.filter((t) => (t.status_id ?? NO_STATUS) === c.id)} />
          ))}
        </div>
        <DragOverlay>{active ? <CardBody task={active} dragging /> : null}</DragOverlay>
      </DndContext>
    </>
  );
}
