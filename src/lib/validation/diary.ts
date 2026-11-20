import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024; // after compression photos are ~300–600 KB
export const MAX_PHOTOS_PER_UPDATE = 20;

export const dailyUpdateSchema = z.object({
  client_ref: uuid,
  project_id: uuid,
  work_date: isoDate,
  work_done: z.string().trim().min(1, "Write what you did today").max(8000),
  hours: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 24), "Hours must be between 0 and 24"),
  issues: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});

export const dailyUpdateEditSchema = dailyUpdateSchema.pick({ work_done: true, hours: true, issues: true });

export const photoTicketSchema = z.object({
  update_id: uuid,
  photos: z
    .array(z.object({ id: uuid, size: z.number().int().positive().max(PHOTO_MAX_BYTES), thumb_size: z.number().int().positive().max(PHOTO_MAX_BYTES) }))
    .min(1)
    .max(MAX_PHOTOS_PER_UPDATE),
});

export const photoRegisterSchema = z.object({
  update_id: uuid,
  photos: z
    .array(z.object({ id: uuid, width: z.number().int().positive().max(20000), height: z.number().int().positive().max(20000), size: z.number().int().positive() }))
    .min(1)
    .max(MAX_PHOTOS_PER_UPDATE),
});

export const reportSchema = z
  .object({ project_id: uuid, from: isoDate, to: isoDate, author: uuid.nullable().optional() })
  .refine((v) => v.to >= v.from, { path: ["to"], message: "The end date must be after the start date" });
