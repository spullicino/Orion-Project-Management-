/** Banner across the top of the app: shared types and the "how long" choices. */
export type BannerTone = "info" | "reminder" | "urgent";
export type BannerItem = { id: string; body: string; link: string | null; tone: BannerTone; ends_at: string | null };

export const BANNER_TONES: Record<BannerTone, { label: string; className: string }> = {
  info: { label: "Info", className: "bg-[#2d57a3] text-white" },
  reminder: { label: "Reminder", className: "bg-amber-400 text-amber-950" },
  urgent: { label: "Urgent", className: "bg-red-600 text-white" },
};

/** Seconds each message stays before the next one. */
export const BANNER_ROTATE_SECONDS = 7;

export type BannerDuration = "today" | "3d" | "1w" | "2w" | "until" | "range" | "forever";
export const BANNER_DURATIONS: { value: BannerDuration; label: string }[] = [
  { value: "today", label: "Today only" },
  { value: "3d", label: "3 days" },
  { value: "1w", label: "1 week" },
  { value: "2w", label: "2 weeks" },
  { value: "until", label: "Until a date and time" },
  { value: "range", label: "From – to (schedule it)" },
  { value: "forever", label: "Until I remove it" },
];

const endOfDay = (d: Date) => {
  const e = new Date(d);
  e.setHours(23, 59, 0, 0);
  return e;
};
const addDays = (d: Date, n: number) => {
  const e = new Date(d);
  e.setDate(e.getDate() + n);
  return e;
};
/** "2026-11-26" + "16:30" in the device's time zone. */
export const localDateTime = (date: string, time: string) => new Date(`${date}T${time || "00:00"}:00`);

/**
 * When a banner starts and ends for the chosen duration. "3 days" means until the end of
 * the third day (today counts as day 1). Returns an error message for impossible choices.
 */
export function bannerRange(
  choice: BannerDuration,
  now: Date,
  custom: { fromDate?: string; fromTime?: string; toDate?: string; toTime?: string } = {},
): { startsAt: Date; endsAt: Date | null } | { error: string } {
  const days = { today: 0, "3d": 2, "1w": 6, "2w": 13 } as const;
  if (choice in days) return { startsAt: now, endsAt: endOfDay(addDays(now, days[choice as keyof typeof days])) };
  if (choice === "forever") return { startsAt: now, endsAt: null };
  const startsAt = choice === "range" ? (custom.fromDate ? localDateTime(custom.fromDate, custom.fromTime || "00:00") : null) : now;
  if (!startsAt || Number.isNaN(+startsAt)) return { error: "Choose when it starts" };
  if (!custom.toDate) return { error: "Choose when it ends" };
  const endsAt = localDateTime(custom.toDate, custom.toTime || "23:59");
  if (Number.isNaN(+endsAt)) return { error: "Choose when it ends" };
  if (endsAt <= startsAt) return { error: "The end must be after the start" };
  if (endsAt <= now) return { error: "The end is already past" };
  return { startsAt, endsAt };
}

export type BannerState = "showing" | "scheduled" | "paused" | "ended";
export function bannerState(b: { paused: boolean; starts_at: string; ends_at: string | null }, now = new Date()): BannerState {
  if (b.ends_at && new Date(b.ends_at) <= now) return "ended";
  if (b.paused) return "paused";
  if (new Date(b.starts_at) > now) return "scheduled";
  return "showing";
}
