"use client";

import { CalendarClock, CheckCircle2, ClipboardPenLine, Diamond, ListTodo, TimerOff } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useBoard } from "@/components/board/board-context";
import { HealthBadge, RiskIcon } from "@/components/health-badge";
import { UserAvatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, shortDate, todayISO } from "@/lib/board";
import { healthSummary, projectHealth } from "@/lib/health";
import { formatDate, fullName } from "@/lib/utils";

function Tile({ icon: Icon, label, value, sub, tone }: { icon: typeof ListTodo; label: string; value: string | number; sub?: string; tone?: "bad" }) {
  return (
    <Card>
      <CardContent className="grid gap-1 p-4">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className="size-4" aria-hidden /> {label}
        </span>
        <span className={`text-3xl font-bold tabular-nums ${tone === "bad" ? "text-destructive" : ""}`}>{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  );
}

export function ProjectDashboard({ diary }: { diary: { count: number; people: number; last: string | null } }) {
  const { board, tasks, risks, labelsById, openTask, membersById } = useBoard();
  const today = todayISO();
  // Progress and health count the programme of works only, not internal (team-only) tasks.
  const works = useMemo(() => tasks.filter((t) => !t.is_internal), [tasks]);
  const internalCount = tasks.length - works.length;
  const health = useMemo(() => projectHealth(works, board.project.end_date, today), [works, board.project.end_date, today]);

  const done = works.filter((t) => t.completed_at).length;
  const open = works.length - done;
  const pct = works.length ? Math.round((done / works.length) * 100) : 0;
  const overdue = works.filter((t) => !t.completed_at && t.due_date && t.due_date < today).length;
  const dueWeek = works.filter((t) => !t.completed_at && t.due_date && t.due_date >= today && t.due_date <= addDays(today, 7)).length;

  // Tasks by status, in the project's status order.
  const byStatus = [
    ...board.labels.map((l) => ({ id: l.id, name: l.name, color: l.color, count: works.filter((t) => t.status_id === l.id).length })),
    { id: "none", name: "No status", color: "#94a3b8", count: works.filter((t) => !t.status_id || !labelsById.has(t.status_id)).length },
  ].filter((s) => s.count > 0);

  // Workload: open and late tasks per person.
  const workload = board.members
    .map((m) => {
      const mine = tasks.filter((t) => !t.completed_at && t.assignees.includes(m.user_id));
      return { m, open: mine.length, late: mine.filter((t) => t.due_date && t.due_date < today).length };
    })
    .filter((w) => w.open > 0)
    .sort((a, b) => b.open - a.open);
  const unassigned = tasks.filter((t) => !t.completed_at && !t.assignees.length).length;
  const maxOpen = Math.max(1, ...workload.map((w) => w.open));

  const attention = tasks
    .map((t) => ({ t, r: risks.get(t.id) }))
    .filter((x): x is { t: (typeof tasks)[number]; r: NonNullable<typeof x.r> } => !!x.r)
    .sort((a, b) => (a.r.level === b.r.level ? (a.t.due_date ?? "9").localeCompare(b.t.due_date ?? "9") : a.r.level === "red" ? -1 : 1));

  const milestones = board.milestones.filter((m) => m.date >= today).slice(0, 5);

  return (
    <div className="grid gap-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <HealthBadge level={health.level} className="text-sm" />
          <span className="text-sm text-muted-foreground">{healthSummary(health)}</span>
          {internalCount > 0 && (
            <span className="w-full text-xs text-muted-foreground">
              Counts the programme of works only — {internalCount} internal {internalCount === 1 ? "task isn't" : "tasks aren't"} included.
            </span>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile icon={CheckCircle2} label="Complete" value={`${pct}%`} sub={`${done} of ${works.length} tasks`} />
        <Tile icon={ListTodo} label="Open tasks" value={open} sub={unassigned ? `${unassigned} without an owner` : undefined} />
        <Tile icon={TimerOff} label="Overdue" value={overdue} tone={overdue ? "bad" : undefined} />
        <Tile icon={CalendarClock} label="Due in 7 days" value={dueWeek} />
        <Tile icon={ClipboardPenLine} label="Daily updates" value={diary.count} sub={`last 7 days · ${diary.people} ${diary.people === 1 ? "person" : "people"}${diary.last ? ` · latest ${formatDate(diary.last)}` : ""}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tasks by status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks yet.</p>
            ) : (
              <>
                {/* One bar split by status (2px gaps between parts); names and counts are listed below. */}
                <div className="flex h-4 gap-0.5" role="img" aria-label={byStatus.map((s) => `${s.name}: ${s.count}`).join(", ")}>
                  {byStatus.map((s, i) => (
                    <div
                      key={s.id}
                      title={`${s.name}: ${s.count} (${Math.round((s.count / tasks.length) * 100)}%)`}
                      style={{ width: `${(s.count / tasks.length) * 100}%`, background: s.color }}
                      className={`${i === 0 ? "rounded-l" : ""} ${i === byStatus.length - 1 ? "rounded-r" : ""}`}
                    />
                  ))}
                </div>
                <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                  {byStatus.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <span className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="font-semibold tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Open tasks per person</CardTitle>
          </CardHeader>
          <CardContent>
            {workload.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody has open tasks.</p>
            ) : (
              <ul className="grid gap-2.5">
                {workload.map(({ m, open: o, late }) => (
                  <li key={m.user_id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <UserAvatar person={m} src={membersById.get(m.user_id)?.avatar_src} size={24} />
                      <span className="truncate">{fullName(m)}</span>
                    </span>
                    <span className="h-2.5 rounded-r bg-muted" title={`${o} open`}>
                      <span className="block h-full rounded-r bg-primary" style={{ width: `${(o / maxOpen) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">
                      {o} open{late ? <span className="font-semibold text-destructive"> · {late} late</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Needs attention ({attention.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is late or at risk. 👍</p>
            ) : (
              <ul className="divide-y">
                {attention.map(({ t, r }) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => openTask(t.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-accent/40">
                      <RiskIcon level={r.level} reason={r.reason} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{t.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.reason}</span>
                      </span>
                      {t.due_date && <span className="shrink-0 text-sm text-muted-foreground">{shortDate(t.due_date)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Upcoming milestones</CardTitle>
          </CardHeader>
          <CardContent>
            {milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None scheduled. <Link href={`/projects/${board.project.id}/gantt`} className="text-primary hover:underline">Add one on the Gantt</Link>.
              </p>
            ) : (
              <ul className="grid gap-2.5">
                {milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <Diamond className="size-4 shrink-0" style={{ color: m.color }} fill={m.color} aria-hidden />
                    <span className="flex-1 truncate font-medium">{m.title}</span>
                    <span className="text-muted-foreground">{formatDate(m.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
