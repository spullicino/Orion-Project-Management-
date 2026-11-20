import type { BoardTask, MyTask, Priority } from "@/types/board";

/** Today's date in Malta as YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Malta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DueState = "done" | "overdue" | "today" | "soon" | "later" | "none";

/** How urgent a due date is. "soon" = within the next 3 days. */
export function dueState(due: string | null, completed: boolean, today = todayISO()): DueState {
  if (completed) return "done";
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  if (due <= addDays(today, 3)) return "soon";
  return "later";
}

export const DUE_STYLES: Record<DueState, string> = {
  done: "text-muted-foreground",
  overdue: "text-destructive font-semibold",
  today: "text-amber-700 dark:text-amber-400 font-semibold",
  soon: "text-foreground font-medium",
  later: "text-muted-foreground",
  none: "text-muted-foreground",
};

/** "12 Mar" (adds the year only when it isn't this year). */
export function shortDate(iso: string | null, today = todayISO()) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(d);
}

export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "#dc2626" },
  { value: "high", label: "High", color: "#ea580c" },
  { value: "medium", label: "Medium", color: "#0584c7" },
  { value: "low", label: "Low", color: "#64748b" },
];
export const PRIORITY_META = Object.fromEntries(PRIORITIES.map((p) => [p.value, p])) as Record<Priority, (typeof PRIORITIES)[number]>;

/** A task is blocked if any task it depends on isn't finished yet. */
export function blockingTasks(task: Pick<BoardTask, "blocked_by">, byId: Map<string, Pick<BoardTask, "completed_at" | "title" | "id">>) {
  return task.blocked_by.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t && !t.completed_at);
}

export type BoardFilters = {
  text: string;
  person: string | "all" | "me" | "none";
  status: string | "all" | "open";
  due: "all" | "overdue" | "week" | "none";
};

export const EMPTY_FILTERS: BoardFilters = { text: "", person: "all", status: "all", due: "all" };

export function filtersActive(f: BoardFilters) {
  return f.text.trim() !== "" || f.person !== "all" || f.status !== "all" || f.due !== "all";
}

export function filterTasks<T extends Pick<BoardTask, "title" | "assignees" | "status_id" | "due_date" | "completed_at">>(
  tasks: T[],
  f: BoardFilters,
  meId: string,
  today = todayISO(),
): T[] {
  const text = f.text.trim().toLowerCase();
  const weekEnd = addDays(today, 7);
  return tasks.filter((t) => {
    if (text && !t.title.toLowerCase().includes(text)) return false;
    if (f.person === "me" && !t.assignees.includes(meId)) return false;
    if (f.person === "none" && t.assignees.length) return false;
    if (!["all", "me", "none"].includes(f.person) && !t.assignees.includes(f.person)) return false;
    if (f.status === "open" && t.completed_at) return false;
    if (!["all", "open"].includes(f.status) && t.status_id !== f.status) return false;
    if (f.due === "overdue" && dueState(t.due_date, !!t.completed_at, today) !== "overdue") return false;
    if (f.due === "week" && (!t.due_date || t.due_date > weekEnd || t.completed_at)) return false;
    if (f.due === "none" && t.due_date) return false;
    return true;
  });
}

export type Bucket = { key: string; label: string; tasks: MyTask[] };

/** Groups "My Tasks" into Overdue / Today / This week / Later / No date / Done recently. */
export function bucketMyTasks(tasks: MyTask[], today = todayISO()): Bucket[] {
  const weekEnd = addDays(today, 7);
  const buckets: Bucket[] = [
    { key: "overdue", label: "Overdue", tasks: [] },
    { key: "today", label: "Due today", tasks: [] },
    { key: "week", label: "Next 7 days", tasks: [] },
    { key: "later", label: "Later", tasks: [] },
    { key: "none", label: "No due date", tasks: [] },
    { key: "done", label: "Done recently", tasks: [] },
  ];
  const by = Object.fromEntries(buckets.map((b) => [b.key, b]));
  for (const t of tasks) {
    if (t.completed_at) by.done.tasks.push(t);
    else if (!t.due_date) by.none.tasks.push(t);
    else if (t.due_date < today) by.overdue.tasks.push(t);
    else if (t.due_date === today) by.today.tasks.push(t);
    else if (t.due_date <= weekEnd) by.week.tasks.push(t);
    else by.later.tasks.push(t);
  }
  return buckets.filter((b) => b.tasks.length);
}

/** Readable text for an activity-log change. */
export function describeChange(
  field: string,
  [from, to]: [unknown, unknown],
  lookup: { status: (id: string) => string | undefined; group: (id: string) => string | undefined },
): string {
  const val = (v: unknown, kind?: "status" | "group" | "date") => {
    if (v === null || v === undefined || v === "") return "none";
    if (kind === "status") return lookup.status(String(v)) ?? "a removed status";
    if (kind === "group") return lookup.group(String(v)) ?? "another group";
    if (kind === "date") return shortDate(String(v));
    return String(v);
  };
  switch (field) {
    case "title":
      return from === null ? `created “${val(to)}”` : `renamed the task to “${val(to)}”`;
    case "status_id":
      return `changed status from ${val(from, "status")} to ${val(to, "status")}`;
    case "group_id":
      return `moved it from ${val(from, "group")} to ${val(to, "group")}`;
    case "priority":
      return `changed priority to ${val(to)}`;
    case "start_date":
      return `set the start date to ${val(to, "date")}`;
    case "due_date":
      return `set the due date to ${val(to, "date")}`;
    case "progress":
      return `updated progress to ${val(to)}%`;
    case "description":
      return "edited the description";
    case "custom_values":
      return "updated a column";
    default:
      return `changed ${field.replace(/_/g, " ")}`;
  }
}
