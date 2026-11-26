import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "task.assigned",
  "task.status",
  "task.comment",
  "task.due_soon",
  "task.overdue",
  "mention",
  "daily.new",
  "daily.reminder",
  "personal.due",
  "chat.message",
  "material.new",
  "material.status",
  "material.comment",
] as const;

/**
 * Someone's notification settings. `types` only lists the switches they changed
 * (missing = on) — so it must be a *partial* record: a plain z.record with fixed
 * keys requires every key and rejected almost every save ("Invalid settings").
 */
export const prefsSchema = z.object({
  push_enabled: z.boolean(),
  email_digest: z.boolean(),
  types: z.partialRecord(z.enum(NOTIFICATION_TYPES), z.boolean()),
  quiet_hours_from: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  quiet_hours_to: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});
