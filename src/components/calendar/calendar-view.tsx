"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useBoard } from "@/components/board/board-context";
import { FilterBar } from "@/components/board/filter-bar";
import { Button } from "@/components/ui/button";
import { dueState, filterTasks, todayISO } from "@/lib/board";
import { dayLabel, monthGrid, monthLabel, shiftMonth } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { BoardTask, Milestone } from "@/types/board";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Item = { kind: "task"; task: BoardTask } | { kind: "milestone"; milestone: Milestone };

export function CalendarView() {
  const { board, tasks, filters, perms, labelsById, openTask } = useBoard();
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const visible = useMemo(() => filterTasks(tasks, filters, perms.meId), [tasks, filters, perms.meId]);

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    const add = (d: string, it: Item) => map.set(d, [...(map.get(d) ?? []), it]);
    for (const m of board.milestones) add(m.date, { kind: "milestone", milestone: m });
    for (const t of visible) if (t.due_date) add(t.due_date, { kind: "task", task: t });
    return map;
  }, [visible, board.milestones]);

  const days = monthGrid(month);
  const inMonth = days.filter((d) => d.startsWith(month));
  const agenda = inMonth.filter((d) => byDay.has(d));
  const noDue = visible.filter((t) => !t.due_date).length;

  const chip = (it: Item, compact = false) =>
    it.kind === "milestone" ? (
      <span key={`m-${it.milestone.id}`} className="flex items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-xs font-semibold" style={{ color: it.milestone.color }}>
        <span className="size-2.5 shrink-0 rotate-45" style={{ background: it.milestone.color }} aria-hidden />
        <span className="truncate">{it.milestone.title}</span>
      </span>
    ) : (
      <button
        key={`t-${it.task.id}`}
        type="button"
        onClick={() => openTask(it.task.id)}
        className={cn(
          "flex w-full items-center gap-1.5 truncate rounded-md text-left text-xs font-medium hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "px-1.5 py-1" : "min-h-11 px-3 py-2 text-sm",
          it.task.completed_at && "line-through opacity-60",
        )}
        style={{ background: `${labelsById.get(it.task.status_id ?? "")?.color ?? "#94a3b8"}26` }}
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: labelsById.get(it.task.status_id ?? "")?.color ?? "#94a3b8" }} aria-hidden />
        <span className={cn("truncate", dueState(it.task.due_date, !!it.task.completed_at) === "overdue" && "text-destructive")}>{it.task.title}</span>
      </button>
    );

  return (
    <>
      <FilterBar />
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft />
        </Button>
        <h2 className="min-w-44 text-center text-lg font-semibold" aria-live="polite">
          {monthLabel(month)}
        </h2>
        <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight />
        </Button>
        {month !== today.slice(0, 7) && (
          <Button variant="ghost" onClick={() => setMonth(today.slice(0, 7))}>
            This month
          </Button>
        )}
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Tasks appear on their due date.{noDue ? ` ${noDue} ${noDue === 1 ? "task has" : "tasks have"} no due date.` : ""}
      </p>

      {/* Computers: month grid */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className="grid grid-cols-7 border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const outside = !d.startsWith(month);
            return (
              <div key={d} className={cn("min-h-28 border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0", outside && "bg-muted/30")}>
                <div
                  className={cn(
                    "mb-1 flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                    d === today ? "bg-destructive text-white" : outside ? "text-muted-foreground/60" : "text-muted-foreground",
                  )}
                >
                  {+d.slice(8, 10)}
                </div>
                <div className="grid gap-1">{items.map((it) => chip(it, true))}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phones: list of days that have something */}
      <div className="md:hidden">
        {agenda.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Nothing due this month.</p>}
        <ul className="grid gap-4">
          {agenda.map((d) => (
            <li key={d}>
              <h3 className={cn("mb-1.5 text-sm font-semibold", d === today ? "text-destructive" : "text-muted-foreground")}>
                {d === today ? "Today · " : ""}
                {dayLabel(d)}
              </h3>
              <div className="grid gap-1.5">{(byDay.get(d) ?? []).map((it) => chip(it))}</div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
