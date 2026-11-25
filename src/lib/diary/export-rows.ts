import { fullName } from "@/lib/utils";
import type { DailyUpdate } from "@/types/diary";

export type UpdateRow = {
  date: string; // YYYY-MM-DD
  person: string;
  project: string;
  hours: number | null;
  workDone: string;
  issues: string;
  photos: number;
  posted: string; // HH:MM Malta
};

export type HoursRow = { person: string; updates: number; days: number; hours: number; projects: string };

const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));

/** Oldest day first, then person, then project — reads like a diary. */
export function sortUpdates(updates: DailyUpdate[]): DailyUpdate[] {
  return [...updates].sort(
    (a, b) =>
      a.work_date.localeCompare(b.work_date) ||
      fullName(a.author).localeCompare(fullName(b.author)) ||
      a.project.name.localeCompare(b.project.name) ||
      a.created_at.localeCompare(b.created_at),
  );
}

/** One row per daily update, for the spreadsheet. */
export function updateRows(updates: DailyUpdate[]): UpdateRow[] {
  return sortUpdates(updates).map((u) => ({
    date: u.work_date,
    person: fullName(u.author),
    project: u.project.name,
    hours: u.hours === null || u.hours === undefined ? null : Number(u.hours),
    workDone: u.work_done,
    issues: u.issues ?? "",
    photos: u.photos.length,
    posted: time(u.created_at),
  }));
}

/** Per person: number of updates, days with an update, total hours and projects — most hours first. */
export function hoursSummary(updates: DailyUpdate[]): HoursRow[] {
  const by = new Map<string, { person: string; updates: number; days: Set<string>; hours: number; projects: Set<string> }>();
  for (const u of updates) {
    const row = by.get(u.author_id) ?? { person: fullName(u.author), updates: 0, days: new Set<string>(), hours: 0, projects: new Set<string>() };
    row.updates++;
    row.days.add(u.work_date);
    row.hours += u.hours ? Number(u.hours) : 0;
    row.projects.add(u.project.name);
    by.set(u.author_id, row);
  }
  return [...by.values()]
    .map((r) => ({ person: r.person, updates: r.updates, days: r.days.size, hours: Math.round(r.hours * 10) / 10, projects: [...r.projects].sort().join(", ") }))
    .sort((a, b) => b.hours - a.hours || a.person.localeCompare(b.person));
}

/** Quick periods in Malta dates. `today` is YYYY-MM-DD. Weeks start on Monday. */
export function periodRange(kind: "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth", today: string): { from: string; to: string } {
  const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const add = (iso0: string, n: number) => {
    const x = d(iso0);
    x.setUTCDate(x.getUTCDate() + n);
    return iso(x);
  };
  const monday = add(today, -((d(today).getUTCDay() + 6) % 7));
  switch (kind) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: add(today, -1), to: add(today, -1) };
    case "thisWeek":
      return { from: monday, to: today };
    case "lastWeek":
      return { from: add(monday, -7), to: add(monday, -1) };
    case "thisMonth":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "lastMonth": {
      const first = `${today.slice(0, 8)}01`;
      const lastDay = add(first, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
  }
}
