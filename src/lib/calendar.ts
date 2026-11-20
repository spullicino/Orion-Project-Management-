import { addDays } from "@/lib/board";

/** All days shown in a month grid (Monday-first), including the leading/trailing days of nearby months. */
export function monthGrid(month: string /* YYYY-MM */): string[] {
  const first = `${month}-01`;
  const dow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(first, -dow);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((dow + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => addDays(start, i));
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
}

export function dayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}
