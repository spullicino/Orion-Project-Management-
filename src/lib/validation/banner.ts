import { z } from "zod";

export const bannerSchema = z
  .object({
    body: z.string().trim().min(1, "Write the message").max(200, "Keep it short — 200 characters at most"),
    link: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v), "A link starts with https:// or / (a page in the app)")
      .transform((v) => v || null),
    tone: z.enum(["info", "reminder", "urgent"]),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    audience: z.discriminatedUnion("type", [
      z.object({ type: z.literal("everyone") }),
      z.object({ type: z.literal("levels"), roles: z.array(z.enum(["admin", "manager", "technician", "basic"])).min(1, "Choose at least one level") }),
      z.object({ type: z.literal("projects"), projectIds: z.array(z.string().uuid()).min(1, "Choose at least one project") }),
      z.object({ type: z.literal("people"), userIds: z.array(z.string().uuid()).min(1, "Choose at least one person").max(500) }),
    ]),
  })
  .refine((v) => !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), { message: "The end must be after the start", path: ["endsAt"] });
export type BannerInput = z.input<typeof bannerSchema>;
