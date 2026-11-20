/**
 * Pure Gantt layout maths (no React, no DOM) so the on-screen chart, the
 * client share page and the PDF/PNG export all draw exactly the same thing.
 * Dates are ISO "YYYY-MM-DD" strings and are treated as whole UTC days.
 */

export type Zoom = "day" | "week" | "month";
export type ColorBy = "status" | "group";

export type GanttTask = {
  id: string;
  title: string;
  group_id: string;
  status_id: string | null;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  completed_at: string | null;
  blocked_by: string[];
  /** Owner names, only filled in when they should be shown. */
  owners?: string[];
};
export type GanttGroup = { id: string; name: string; color: string };
export type GanttMilestone = { id: string; title: string; date: string; color: string };
export type GanttLabel = { id: string; name: string; color: string; is_done: boolean };

export type GanttInput = {
  tasks: GanttTask[];
  groups: GanttGroup[];
  milestones: GanttMilestone[];
  labels: GanttLabel[];
  projectStart?: string | null;
  projectEnd?: string | null;
};

export type GanttOptions = { zoom: Zoom; colorBy: ColorBy; today: string; showOwners?: boolean };

export const DAY_WIDTH: Record<Zoom, number> = { day: 36, week: 14, month: 4 };
export const ROW_HEIGHT = 40;
export const GROUP_ROW_HEIGHT = 34;
export const MILESTONE_ROW_HEIGHT = 36;
export const HEADER_HEIGHT = 52;
export const BAR_HEIGHT = 22;
const PADDING_DAYS: Record<Zoom, number> = { day: 3, week: 7, month: 14 };
const NO_STATUS_COLOR = "#94a3b8";

const MS_DAY = 86_400_000;
export const toUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / MS_DAY);
export const shiftDate = (iso: string, days: number) => fromUTC(toUTC(iso) + days * MS_DAY);

export type TaskRow = {
  kind: "task";
  task: GanttTask;
  y: number;
  height: number;
  bar: { x: number; width: number; start: string; end: string } | null;
  color: string;
};
export type GroupRow = { kind: "group"; group: GanttGroup; y: number; height: number; count: number };
export type MilestoneRow = { kind: "milestones"; y: number; height: number };
export type Row = TaskRow | GroupRow | MilestoneRow;

export type Tick = { x: number; width: number; label: string; weekend?: boolean };
export type DepPath = { from: string; to: string; d: string; late: boolean };

export type GanttLayout = {
  start: string;
  end: string;
  days: number;
  dayWidth: number;
  width: number;
  height: number;
  rows: Row[];
  topTicks: Tick[];
  bottomTicks: Tick[];
  deps: DepPath[];
  milestones: (GanttMilestone & { x: number })[];
  todayX: number | null;
  /** Legend for the chosen colouring. */
  legend: { label: string; color: string }[];
};

/** Start and end (inclusive) of a task's bar. One date alone gives a one-day bar. */
export function taskSpan(t: Pick<GanttTask, "start_date" | "due_date">): { start: string; end: string } | null {
  const start = t.start_date ?? t.due_date;
  const end = t.due_date ?? t.start_date;
  if (!start || !end) return null;
  return end < start ? { start: end, end: start } : { start, end };
}

/** Picks the zoom that keeps the chart readable within a target width (used for exports). */
export function autoZoom(input: GanttInput, today: string, targetWidth = 1500): Zoom {
  const { days } = dateRange(input, today, "day");
  if (days * DAY_WIDTH.day <= targetWidth) return "day";
  if (days * DAY_WIDTH.week <= targetWidth) return "week";
  return "month";
}

function dateRange(input: GanttInput, today: string, zoom: Zoom) {
  const dates: string[] = [today];
  for (const t of input.tasks) {
    const s = taskSpan(t);
    if (s) dates.push(s.start, s.end);
  }
  for (const m of input.milestones) dates.push(m.date);
  if (input.projectStart) dates.push(input.projectStart);
  if (input.projectEnd) dates.push(input.projectEnd);
  dates.sort();
  let start = shiftDate(dates[0], -PADDING_DAYS[zoom]);
  let end = shiftDate(dates[dates.length - 1], PADDING_DAYS[zoom]);
  if (zoom === "week") {
    // Start on a Monday so week columns line up.
    const dow = (new Date(toUTC(start)).getUTCDay() + 6) % 7;
    start = shiftDate(start, -dow);
  }
  if (zoom === "month") {
    start = `${start.slice(0, 7)}-01`;
    const e = new Date(toUTC(end));
    end = fromUTC(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0));
  }
  if (daysBetween(start, end) < 14) end = shiftDate(start, 14);
  return { start, end, days: daysBetween(start, end) + 1 };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ticks(start: string, days: number, dayWidth: number, zoom: Zoom) {
  const top: Tick[] = [];
  const bottom: Tick[] = [];
  const pushTop = (label: string, fromDay: number, toDay: number) =>
    top.push({ x: fromDay * dayWidth, width: (toDay - fromDay) * dayWidth, label });

  // Top row: months (years in month zoom).
  let segStart = 0;
  for (let i = 1; i <= days; i++) {
    const prev = shiftDate(start, i - 1);
    const cur = shiftDate(start, i);
    const boundary = zoom === "month" ? cur.slice(0, 4) !== prev.slice(0, 4) : cur.slice(0, 7) !== prev.slice(0, 7);
    if (boundary || i === days) {
      const label = zoom === "month" ? prev.slice(0, 4) : `${MONTHS[+prev.slice(5, 7) - 1]} ${prev.slice(0, 4)}`;
      pushTop(label, segStart, i);
      segStart = i;
    }
  }

  // Bottom row
  for (let i = 0; i < days; i++) {
    const d = shiftDate(start, i);
    const dow = new Date(toUTC(d)).getUTCDay();
    if (zoom === "day") {
      bottom.push({ x: i * dayWidth, width: dayWidth, label: String(+d.slice(8, 10)), weekend: dow === 0 || dow === 6 });
    } else if (zoom === "week" && dow === 1) {
      bottom.push({ x: i * dayWidth, width: Math.min(7, days - i) * dayWidth, label: `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}` });
    } else if (zoom === "month" && d.slice(8, 10) === "01") {
      const e = new Date(toUTC(d));
      const len = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate();
      bottom.push({ x: i * dayWidth, width: Math.min(len, days - i) * dayWidth, label: MONTHS[+d.slice(5, 7) - 1] });
    }
  }
  return { top, bottom };
}

export function layoutGantt(input: GanttInput, opts: GanttOptions): GanttLayout {
  const { zoom, colorBy, today } = opts;
  const dayWidth = DAY_WIDTH[zoom];
  const { start, end, days } = dateRange(input, today, zoom);
  const xFor = (iso: string) => daysBetween(start, iso) * dayWidth;
  const labelsById = new Map(input.labels.map((l) => [l.id, l]));

  const rows: Row[] = [];
  let y = HEADER_HEIGHT;
  if (input.milestones.length) {
    rows.push({ kind: "milestones", y, height: MILESTONE_ROW_HEIGHT });
    y += MILESTONE_ROW_HEIGHT;
  }

  const taskRowById = new Map<string, TaskRow>();
  const groupIds = new Set(input.groups.map((g) => g.id));
  const groups = [...input.groups];
  if (input.tasks.some((t) => !groupIds.has(t.group_id))) groups.push({ id: "__other__", name: "Other", color: "#64748b" });

  for (const g of groups) {
    const tasks = input.tasks.filter((t) => (g.id === "__other__" ? !groupIds.has(t.group_id) : t.group_id === g.id));
    if (!tasks.length) continue;
    rows.push({ kind: "group", group: g, y, height: GROUP_ROW_HEIGHT, count: tasks.length });
    y += GROUP_ROW_HEIGHT;
    for (const t of tasks) {
      const span = taskSpan(t);
      const color =
        colorBy === "group" ? g.color : (t.status_id ? labelsById.get(t.status_id)?.color : undefined) ?? NO_STATUS_COLOR;
      const row: TaskRow = {
        kind: "task",
        task: t,
        y,
        height: ROW_HEIGHT,
        color,
        bar: span ? { x: xFor(span.start), width: (daysBetween(span.start, span.end) + 1) * dayWidth, ...span } : null,
      };
      rows.push(row);
      taskRowById.set(t.id, row);
      y += ROW_HEIGHT;
    }
  }

  // Dependency arrows: from the end of the task waited for → the start of the waiting task.
  const deps: DepPath[] = [];
  for (const row of taskRowById.values()) {
    if (!row.bar) continue;
    for (const fromId of row.task.blocked_by) {
      const from = taskRowById.get(fromId);
      if (!from?.bar) continue;
      const x1 = from.bar.x + from.bar.width;
      const y1 = from.y + from.height / 2;
      const x2 = row.bar.x;
      const y2 = row.y + row.height / 2;
      const late = row.bar.start <= from.bar.end;
      const d =
        x2 - x1 >= 16
          ? `M${x1},${y1} H${x1 + 8} V${y2} H${x2}`
          : `M${x1},${y1} H${x1 + 8} V${y2 - row.height / 2} H${x2 - 10} V${y2} H${x2}`;
      deps.push({ from: fromId, to: row.task.id, d, late });
    }
  }

  const legend =
    colorBy === "group"
      ? groups.filter((g) => rows.some((r) => r.kind === "group" && r.group.id === g.id)).map((g) => ({ label: g.name, color: g.color }))
      : input.labels.map((l) => ({ label: l.name, color: l.color }));

  const { top, bottom } = ticks(start, days, dayWidth, zoom);
  const todayInRange = today >= start && today <= end;
  return {
    start,
    end,
    days,
    dayWidth,
    width: days * dayWidth,
    height: y,
    rows,
    topTicks: top,
    bottomTicks: bottom,
    deps,
    milestones: input.milestones.map((m) => ({ ...m, x: xFor(m.date) + dayWidth / 2 })),
    todayX: todayInRange ? xFor(today) + dayWidth / 2 : null,
    legend,
  };
}

/** Converts a horizontal drag distance to whole days. */
export const dragDays = (dx: number, dayWidth: number) => Math.round(dx / dayWidth);

/** New dates after dragging a bar (move) or one of its ends (resize). */
export function applyDrag(span: { start: string; end: string }, mode: "move" | "start" | "end", delta: number) {
  if (mode === "move") return { start: shiftDate(span.start, delta), end: shiftDate(span.end, delta) };
  if (mode === "start") {
    const start = shiftDate(span.start, delta);
    return { start: start > span.end ? span.end : start, end: span.end };
  }
  const end = shiftDate(span.end, delta);
  return { start: span.start, end: end < span.start ? span.start : end };
}

/** Shortens text to roughly fit a width (no font measuring available in exports). */
export function ellipsize(text: string, maxChars: number) {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}
