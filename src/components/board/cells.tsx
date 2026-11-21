"use client";

import { Check, Link2, Lock, Repeat, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { setTaskAssignee } from "@/app/(app)/projects/actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { blockingTasks, DUE_STYLES, dueState, PRIORITIES, PRIORITY_META, REPEAT_OPTIONS, repeatLabel, shortDate } from "@/lib/board";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { cn, fullName } from "@/lib/utils";
import { readableTextOn } from "@/lib/utils";
import type { BoardTask, Member, Priority, StatusLabel } from "@/types/board";
import type { RepeatRule } from "@/types/database";
import { useBoard } from "./board-context";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function StatusPill({ label, className }: { label: StatusLabel | undefined | null; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-8 min-w-24 items-center justify-center truncate rounded-md px-2 text-xs font-semibold", className)}
      style={{ background: label?.color ?? "#94a3b8", color: readableTextOn(label?.color ?? "#94a3b8") }}
    >
      {label?.name ?? "No status"}
    </span>
  );
}

/** Big coloured buttons — one tap to change status. */
export function StatusPicker({ task, className, full }: { task: BoardTask; className?: string; full?: boolean }) {
  const { board, labelsById, patchTask, perms } = useBoard();
  const [open, setOpen] = useState(false);
  const label = task.status_id ? labelsById.get(task.status_id) : null;
  if (!perms.canEdit) return <StatusPill label={label} className={cn(full && "w-full", className)} />;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Status: ${label?.name ?? "none"}. Change status`}
          className={cn("rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", full && "w-full", className)}
        >
          <StatusPill label={label} className={cn("h-9", full && "w-full")} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="grid w-56 gap-1.5">
        {board.labels.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              setOpen(false);
              if (l.id !== task.status_id) void patchTask(task.id, { status_id: l.id });
            }}
            className="flex h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ background: l.color, color: readableTextOn(l.color) }}
          >
            {l.name}
            {l.id === task.status_id && <Check className="size-4" aria-hidden />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

export function AvatarStack({ ids, members, max = 3, size = 28 }: { ids: string[]; members: Map<string, Member>; max?: number; size?: number }) {
  const shown = ids.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((id, i) => {
        const m = members.get(id);
        return (
          <UserAvatar
            key={id}
            person={m ?? { email: "?" }}
            src={m?.avatar_src}
            size={size}
            className={cn("ring-2 ring-card", i > 0 && "-ml-2")}
          />
        );
      })}
      {ids.length > max && (
        <span
          className="-ml-2 inline-flex items-center justify-center rounded-full bg-muted text-[11px] font-semibold ring-2 ring-card"
          style={{ width: size, height: size }}
        >
          +{ids.length - max}
        </span>
      )}
    </span>
  );
}

export function OwnerPicker({ task }: { task: BoardTask }) {
  const { board, membersById, perms } = useBoard();
  const [assigned, setAssigned] = useState<string[] | null>(null);
  const current = assigned ?? task.assignees;
  const names = current.map((id) => fullName(membersById.get(id) ?? {})).join(", ");

  async function toggle(userId: string) {
    const on = !current.includes(userId);
    const next = on ? [...current, userId] : current.filter((x) => x !== userId);
    setAssigned(next);
    const res = await setTaskAssignee(task.id, userId, on);
    if (!res.ok) {
      toast.error(res.error);
      setAssigned(null);
    }
  }

  const trigger = current.length ? (
    <AvatarStack ids={current} members={membersById} />
  ) : (
    <span className="inline-flex size-8 items-center justify-center rounded-full border border-dashed text-muted-foreground">
      <UserPlus className="size-4" aria-hidden />
    </span>
  );

  if (!perms.canEdit) return <span title={names || "No owner"}>{trigger}</span>;

  return (
    <Popover onOpenChange={(o) => !o && setAssigned(null)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 min-w-11 items-center rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={current.length ? `Owners: ${names}. Change owners` : "Add an owner"}
        >
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1">
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project members</p>
        <ul className="max-h-72 overflow-y-auto">
          {board.members.map((m) => {
            const on = current.includes(m.user_id);
            const allowed = perms.canManage || m.user_id === perms.meId;
            return (
              <li key={m.user_id}>
                <button
                  type="button"
                  disabled={!allowed}
                  onClick={() => toggle(m.user_id)}
                  className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
                  aria-pressed={on}
                >
                  <UserAvatar person={m} src={m.avatar_src} size={30} />
                  <span className="min-w-0 flex-1 truncate">
                    {fullName(m)}
                    {m.user_id === perms.meId && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  {on && <Check className="size-4 text-primary" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        {!perms.canManage && <p className="px-3 py-2 text-xs text-muted-foreground">You can add or remove yourself.</p>}
        {perms.canManage && <p className="px-3 py-2 text-xs text-muted-foreground">Add more people in project Settings.</p>}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITY_META[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
      {p.label}
    </span>
  );
}

export function PriorityPicker({ task }: { task: BoardTask }) {
  const { patchTask, perms } = useBoard();
  const [open, setOpen] = useState(false);
  if (!perms.canEdit) return <PriorityBadge priority={task.priority} />;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-11 items-center rounded-lg px-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Priority: ${PRIORITY_META[task.priority].label}. Change priority`}>
          <PriorityBadge priority={task.priority} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="grid w-44 gap-1 p-1">
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              setOpen(false);
              if (p.value !== task.priority) void patchTask(task.id, { priority: p.value });
            }}
            className="flex h-11 items-center justify-between rounded-lg px-3 hover:bg-accent"
          >
            <PriorityBadge priority={p.value} />
            {p.value === task.priority && <Check className="size-4" aria-hidden />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Dates (native date pickers: the easiest option on phones)
// ---------------------------------------------------------------------------

export function DateCell({ task, field }: { task: BoardTask; field: "start_date" | "due_date" }) {
  const { patchTask, perms } = useBoard();
  const value = task[field];
  const state = field === "due_date" ? dueState(value, !!task.completed_at) : "later";
  const label = field === "due_date" ? "Due date" : "Start date";
  const text = value ? shortDate(value) : "—";
  if (!perms.canEdit) return <span className={cn("text-sm", DUE_STYLES[state])}>{text}</span>;
  return (
    <label className="relative flex h-11 cursor-pointer items-center rounded-lg px-2 text-sm hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
      <span className={cn(DUE_STYLES[state], !value && "text-muted-foreground")}>{text}</span>
      <input
        type="date"
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => {
          const next = e.target.value || null;
          const other = field === "start_date" ? task.due_date : task.start_date;
          if (next && other && (field === "start_date" ? next > other : next < other)) {
            toast.error("The due date can't be before the start date.");
            return;
          }
          void patchTask(task.id, { [field]: next });
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function ProgressCell({ task }: { task: BoardTask }) {
  const { patchTask, perms } = useBoard();
  const [open, setOpen] = useState(false);
  const bar = (
    <span className="flex w-full items-center gap-2">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-success" style={{ width: `${task.progress}%` }} />
      </span>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{task.progress}%</span>
    </span>
  );
  if (!perms.canEdit) return bar;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-11 w-full items-center rounded-lg px-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Progress ${task.progress}%. Change progress`}>
          {bar}
        </button>
      </PopoverTrigger>
      <PopoverContent className="grid w-60 grid-cols-3 gap-1.5">
        {[0, 10, 25, 50, 75, 90].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setOpen(false);
              void patchTask(task.id, { progress: v });
            }}
            className={cn("h-11 rounded-lg border text-sm font-medium hover:bg-accent", v === task.progress && "border-primary bg-primary/10 text-primary")}
          >
            {v}%
          </button>
        ))}
        <p className="col-span-3 pt-1 text-xs text-muted-foreground">Set the status to a “done” status to mark it 100%.</p>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Dependencies indicator
// ---------------------------------------------------------------------------

export function DependencyCell({ task }: { task: BoardTask }) {
  const { byId } = useBoard();
  if (!task.blocked_by.length) return <span className="text-sm text-muted-foreground">—</span>;
  const open = blockingTasks(task, byId);
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-sm", open.length ? "font-medium text-destructive" : "text-muted-foreground")}
      title={open.length ? `Waiting for: ${open.map((t) => t.title).join(", ")}` : "All tasks it depends on are done"}
    >
      {open.length ? <Lock className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
      {open.length ? `Waiting (${open.length})` : `${task.blocked_by.length} done`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Repeat
// ---------------------------------------------------------------------------

/** Small 🔁 marker next to the name of a repeating task. */
export function RepeatMark({ task, className }: { task: BoardTask; className?: string }) {
  const label = repeatLabel(task.repeat_rule);
  if (!label) return null;
  return (
    <span className={cn("inline-flex shrink-0 text-muted-foreground", className)} title={`Repeats: ${label.toLowerCase()}`}>
      <Repeat className="size-3.5" aria-hidden />
      <span className="sr-only">Repeats {label.toLowerCase()}</span>
    </span>
  );
}

/** "Repeat" in the task panel: how often, and optionally until when. */
export function RepeatPicker({ task }: { task: BoardTask }) {
  const { patchTask, perms } = useBoard();
  const label = repeatLabel(task.repeat_rule);
  const untilText = task.repeat_until ? `Until ${shortDate(task.repeat_until)}` : "No end date";
  if (task.repeat_rule === undefined) {
    return <span className="text-sm text-muted-foreground">Available after the next database update</span>;
  }
  if (!perms.canEdit) {
    return (
      <span className="text-sm">
        {label ?? "Doesn't repeat"}
        {label && task.repeat_until ? ` · until ${shortDate(task.repeat_until)}` : ""}
      </span>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="min-w-44 flex-1">
        <NativeSelect
          aria-label="Repeat"
          value={task.repeat_rule ?? ""}
          onChange={(e) => {
            const rule = (e.target.value || null) as RepeatRule | null;
            void patchTask(task.id, rule ? { repeat_rule: rule } : { repeat_rule: null, repeat_until: null });
            if (rule && !task.due_date && !task.start_date) toast("Tip: give it a due date so each repeat gets the right date.");
          }}
        >
          <option value="">Doesn&apos;t repeat</option>
          {REPEAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {task.repeat_rule && (
        <label className="relative flex h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
          <span className={task.repeat_until ? "" : "text-muted-foreground"}>{untilText}</span>
          <input
            type="date"
            aria-label={`${untilText} (repeat end date, optional)`}
            value={task.repeat_until ?? ""}
            onChange={(e) => void patchTask(task.id, { repeat_until: e.target.value || null })}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal (team-only) tasks
// ---------------------------------------------------------------------------

/** 🔒 marker for internal tasks (hidden from clients and the programme of works). */
export function InternalMark({ task, className }: { task: Pick<BoardTask, "is_internal">; className?: string }) {
  if (!task.is_internal) return null;
  return (
    <span className={cn("inline-flex shrink-0 text-muted-foreground", className)} title="Internal: not shown to clients or on the programme of works">
      <Lock className="size-3.5" aria-hidden />
      <span className="sr-only">Internal task</span>
    </span>
  );
}

/** "Internal" switch in the task panel. */
export function InternalSwitch({ task }: { task: BoardTask }) {
  const { patchTask, perms } = useBoard();
  if (task.is_internal === undefined) return <span className="text-sm text-muted-foreground">Available after the next database update</span>;
  return (
    <label className="flex min-h-11 w-full items-center gap-3">
      <Switch
        checked={task.is_internal}
        disabled={!perms.canEdit}
        onCheckedChange={(v) => void patchTask(task.id, { is_internal: v })}
        aria-describedby={`internal-hint-${task.id}`}
      />
      <span id={`internal-hint-${task.id}`} className="text-sm text-muted-foreground">
        {task.is_internal ? "Team only: hidden from the client and the programme of works" : "Part of the programme of works"}
      </span>
    </label>
  );
}

/** Gantt & Kanban: show or hide internal tasks (only appears when the project has some). */
export function InternalToggle() {
  const { tasks, showInternal, setShowInternal } = useBoard();
  const n = tasks.filter((t) => t.is_internal).length;
  if (!n) return null;
  return (
    <label className="inline-flex h-11 items-center gap-2 rounded-lg border bg-card px-3 text-sm">
      <Switch checked={showInternal} onCheckedChange={setShowInternal} />
      <Lock className="size-3.5 text-muted-foreground" aria-hidden />
      Show internal tasks ({n})
    </label>
  );
}
