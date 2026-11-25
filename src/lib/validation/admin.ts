import { z } from "zod";
import { repeatWindowSchema } from "./announcements";
import { emailSchema } from "./auth";

export const roleSchema = z.enum(["admin", "manager", "technician", "basic"]);

export const inviteSchema = z.object({ email: emailSchema, role: roleSchema });

export const approveSchema = z.object({ userId: z.string().uuid(), role: roleSchema });

export const changeRoleSchema = z.object({ userId: z.string().uuid(), role: roleSchema });

export const setStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "deactivated"]),
});

export const settingsSchema = z.object({
  basicCanPostChat: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  // Quarter hours between 06:00 and 20:45 (the reminder job checks every 15 minutes).
  reminderTime: z
    .string()
    .regex(/^(0[6-9]|1\d|20):(00|15|30|45)$/, "Choose a time between 06:00 and 20:45")
    .optional(),
  messageRepeat: repeatWindowSchema.optional(),
});

/** An administrator typing in someone else's name. */
export const setNameSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string().trim().min(1, "Enter a first name").max(80),
  lastName: z.string().trim().max(80).optional().default(""), // surname is optional
});
