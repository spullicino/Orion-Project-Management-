import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const priority = z.enum(["low", "medium", "high", "critical"]);
const checklist = z.array(z.object({ text: z.string().trim().min(1).max(300), done: z.boolean() })).max(100);

export const generalTaskCreateSchema = z.object({
  title: z.string().trim().min(1, "Write what needs doing").max(300),
  description: z.string().trim().max(8000).nullable().optional(),
  client_id: uuid.nullable().optional(),
  due_date: isoDate.nullable().optional(),
  priority: priority.default("medium"),
  assignee_ids: z.array(uuid).min(1, "Choose who should do it").max(50),
});

export const generalTaskPatchSchema = z
  .object({
    title: z.string().trim().min(1, "Write what needs doing").max(300),
    description: z.string().trim().max(8000).nullable(),
    client_id: uuid.nullable(),
    due_date: isoDate.nullable(),
    priority,
    status: z.enum(["not_started", "working", "waiting", "done"]),
    checklist,
  })
  .partial();

export const generalCommentSchema = z.object({ task_id: uuid, body: z.string().trim().min(1, "Write a comment").max(4000) });
