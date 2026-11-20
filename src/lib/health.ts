import { addDays, todayISO } from "@/lib/board";
import type { BoardTask, Priority } from "@/types/board";

/**
 * Delay warnings. Mirrors app.task_risk / app.project_health in
 * supabase/migrations/…0012_notifications_health.sql — keep both in sync.
 */
export type RiskLevel = "red" | "amber";
export type Risk = { level: RiskLevel; reason: string } | null;
export type HealthLevel = "red" | "amber" | "green";
export type ProjectHealth = { level: HealthLevel; red: number; amber: number; open: number; past_end: boolean };

type T = Pick<BoardTask, "id" | "title" | "start_date" | "due_date" | "progress" | "completed_at" | "blocked_by"> & { priority?: Priority };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function taskRisk(t: T, byId: Map<string, T>, today = todayISO()): Risk {
  if (t.completed_at) return null;
  if (t.due_date && t.due_date < today) return { level: "red", reason: "Overdue" };
  const blockers = t.blocked_by.map((id) => byId.get(id)).filter((b): b is T => !!b && !b.completed_at);
  const late = blockers.find((b) => b.due_date && b.due_date < today);
  if (late) return { level: "red", reason: `Waiting for a late task: ${late.title}` };
  if (t.due_date && t.due_date <= addDays(today, 2) && t.progress < 50) return { level: "amber", reason: "Due soon with little progress" };
  if (t.start_date && t.due_date && t.due_date > t.start_date && today > t.start_date) {
    const elapsed = Math.min(100, (daysBetween(t.start_date, today) * 100) / daysBetween(t.start_date, t.due_date));
    if (t.progress < elapsed - 30) return { level: "amber", reason: "Behind schedule" };
  }
  const startsAt = t.start_date ?? t.due_date;
  if (blockers.length && startsAt && startsAt <= addDays(today, 3)) return { level: "amber", reason: `Waiting for: ${blockers[0].title}` };
  return null;
}

export function projectHealth(tasks: T[], endDate: string | null, today = todayISO()): ProjectHealth {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const open = tasks.filter((t) => !t.completed_at);
  let red = 0;
  let amber = 0;
  let redImportant = 0;
  for (const t of open) {
    const r = taskRisk(t, byId, today);
    if (r?.level === "red") {
      red++;
      if (t.priority === "high" || t.priority === "critical") redImportant++;
    } else if (r?.level === "amber") amber++;
  }
  const pastEnd = !!endDate && endDate < today && open.length > 0;
  const level: HealthLevel = redImportant > 0 || (red >= 2 && red * 5 >= open.length) || pastEnd ? "red" : red || amber ? "amber" : "green";
  return { level, red, amber, open: open.length, past_end: pastEnd };
}

export const HEALTH_LABEL: Record<HealthLevel, string> = { red: "At risk", amber: "Needs attention", green: "On track" };

export function healthSummary(h: ProjectHealth) {
  const parts: string[] = [];
  if (h.past_end) parts.push("planned end date has passed");
  if (h.red) parts.push(`${h.red} late`);
  if (h.amber) parts.push(`${h.amber} need attention`);
  return parts.length ? parts.join(" · ") : "No late or risky tasks";
}
