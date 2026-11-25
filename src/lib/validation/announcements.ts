import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time");
export const repeatWindowSchema = z
  .object({ from: hhmm, to: hhmm, weekdaysOnly: z.boolean(), days: z.number().int().min(1).max(14) })
  .refine((v) => v.from < v.to, { message: "The end time must be after the start time", path: ["to"] });

export const announcementSchema = z.object({
  title: z.string().trim().min(1, "Write a short title").max(120),
  body: z.string().trim().min(1, "Write the message").max(4000),
  audience: z.discriminatedUnion("type", [
    z.object({ type: z.literal("everyone") }),
    z.object({ type: z.literal("levels"), roles: z.array(z.enum(["admin", "manager", "technician", "basic"])).min(1, "Choose at least one level") }),
    z.object({ type: z.literal("projects"), projectIds: z.array(z.string().uuid()).min(1, "Choose at least one project") }),
    z.object({ type: z.literal("people"), userIds: z.array(z.string().uuid()).min(1, "Choose at least one person").max(500) }),
  ]),
  remindEveryHours: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]).nullable(),
  /** When repeats may be sent (Malta time). Missing = the default from Admin → Settings. */
  repeat: repeatWindowSchema.optional(),
});
export type AnnouncementInput = z.input<typeof announcementSchema>;
