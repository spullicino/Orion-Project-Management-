/** Helpers for Admin → Activity. `now` is passed in so the page renders the same on server and phone. */

export type ActivityLevel = "today" | "recent" | "quiet" | "inactive";

const DAY = 24 * 60 * 60 * 1000;
const maltaDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Malta" }).format(d); // YYYY-MM-DD

/** Whole calendar days (Malta) between the date and now. */
export function daysSince(iso: string, now: number): number {
  const a = Date.parse(`${maltaDate(new Date(iso))}T00:00:00Z`);
  const b = Date.parse(`${maltaDate(new Date(now))}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / DAY));
}

/** green = today, grey = 1–2 days, amber = 3–6 days, red = a week or more / never. */
export function activityLevel(lastSeen: string | null, now: number): ActivityLevel {
  if (!lastSeen) return "inactive";
  const d = daysSince(lastSeen, now);
  return d === 0 ? "today" : d < 3 ? "recent" : d < 7 ? "quiet" : "inactive";
}

/** "Today 14:20", "Yesterday 09:05", "5 days ago", "3 Nov", "Never". */
export function lastSeenLabel(lastSeen: string | null, now: number): string {
  if (!lastSeen) return "Never";
  const d = daysSince(lastSeen, now);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(lastSeen));
  if (d === 0) return `Today ${time}`;
  if (d === 1) return `Yesterday ${time}`;
  if (d < 14) return `${d} days ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Malta" }).format(new Date(lastSeen));
}

/** For a work date (YYYY-MM-DD): "Today", "Yesterday", "4 days ago", "3 Nov", "Never". */
export function lastUpdateLabel(workDate: string | null, now: number): string {
  if (!workDate) return "Never";
  const d = daysSince(`${workDate}T12:00:00Z`, now);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 14) return `${d} days ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${workDate}T12:00:00Z`));
}
