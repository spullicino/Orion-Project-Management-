import { z } from "zod";
import { BUILTIN_COLUMNS } from "@/types/board";

const uuid = z.string().uuid();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour");
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const datesInOrder = (v: { start_date?: string | null; due_date?: string | null; end_date?: string | null }) => {
  const end = v.due_date ?? v.end_date;
  return !v.start_date || !end || end >= v.start_date;
};

export const PROJECT_COLORS = ["#2d57a3", "#0584c7", "#02b5ef", "#0f766e", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#c026d3", "#7c3aed", "#475569"] as const;

export const projectSchema = z
  .object({
    name: z.string().trim().min(1, "Give the project a name").max(160),
    code: optionalText(40),
    description: optionalText(8000),
    client_id: uuid.nullable().optional().or(z.literal("").transform(() => null)),
    new_client_name: optionalText(160),
    start_date: optionalDate,
    end_date: optionalDate,
    color: hex,
    status: z.enum(["active", "on_hold", "completed", "archived"]).default("active"),
  })
  .refine(datesInOrder, { path: ["end_date"], message: "End date must be after the start date" });

export const createProjectSchema = projectSchema.and(
  z.object({
    source_id: uuid.nullable().optional().or(z.literal("").transform(() => null)),
    member_ids: z.array(uuid).max(200).default([]),
  }),
);

export const groupSchema = z.object({
  project_id: uuid,
  name: z.string().trim().min(1, "Give the group a name").max(120),
  color: hex.optional(),
});

export const newTaskSchema = z.object({
  project_id: uuid,
  group_id: uuid,
  title: z.string().trim().min(1, "Type a task name").max(300),
});

/** Partial update of a task. Only these fields can be changed from the app. */
export const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1, "Task name can't be empty").max(300),
    description: optionalText(20000),
    internal_notes: optionalText(8000),
    status_id: uuid.nullable(),
    priority: z.enum(["low", "medium", "high", "critical"]),
    start_date: optionalDate,
    due_date: optionalDate,
    progress: z.coerce.number().int().min(0).max(100),
    group_id: uuid,
    custom_values: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.null()])),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const labelSchema = z.object({
  name: z.string().trim().min(1, "Give the status a name").max(40),
  color: hex,
  is_done: z.boolean().default(false),
});

export const customColumnSchema = z.object({
  project_id: uuid,
  name: z.string().trim().min(1, "Give the column a name").max(60),
  kind: z.enum(["text", "number", "file"]),
});

export const hiddenColumnsSchema = z.array(z.enum(BUILTIN_COLUMNS));

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name").max(160),
  contact_name: optionalText(160),
  contact_email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email")
    .max(254)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  contact_phone: optionalText(40),
  notes: optionalText(4000),
});

export const commentSchema = z.object({ task_id: uuid, body: z.string().trim().min(1, "Write something first").max(8000) });
export const checklistItemSchema = z.object({ task_id: uuid, title: z.string().trim().min(1).max(300) });

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export const milestoneSchema = z.object({
  title: z.string().trim().min(1, "Give the milestone a name").max(160),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  color: hex.default("#7c3aed"),
  description: optionalText(4000),
});

export const shareLinkSchema = z.object({
  project_id: uuid,
  label: optionalText(120),
  expires_in_days: z.coerce.number().int().refine((n) => [0, 30, 90, 180, 365].includes(n), "Choose how long the link works"),
  hide_owners: z.boolean().default(true),
});

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
