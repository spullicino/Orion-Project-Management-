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
