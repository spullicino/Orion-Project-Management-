import { z } from "zod";
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
  basicCanPostChat: z.boolean(),
});

/** An administrator typing in someone else's name. */
export const setNameSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string().trim().min(1, "Enter a first name").max(80),
  lastName: z.string().trim().min(1, "Enter a surname").max(80),
});
