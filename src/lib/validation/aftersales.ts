import { z } from "zod";

const uuid = z.string().uuid();
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .or(z.literal(""))
  .transform((v) => v || null)
  .nullable()
  .optional();
const email = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Check the email address")
  .transform((v) => v.toLowerCase() || null)
  .nullable()
  .optional();

export const statusEnum = z.enum(["new", "assigned", "in_progress", "waiting", "resolved", "closed"]);
export const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Write the customer's name").max(160),
  kind: z.enum(["company", "person"]),
  phone: opt(40),
  address: opt(300),
  notes: opt(4000),
  client_id: uuid.nullable().optional(),
});
export type CustomerInput = z.input<typeof customerSchema>;

export const contactSchema = z
  .object({ customer_id: uuid, name: z.string().trim().max(160), email, phone: opt(40) })
  .refine((v) => v.name || v.email || v.phone, { message: "Add a name, email or phone", path: ["name"] });
export type ContactInput = z.input<typeof contactSchema>;

export const siteSchema = z.object({
  customer_id: uuid,
  name: z.string().trim().min(1, "Name the site, e.g. Solair Apartments – Block B").max(160),
  address: opt(300),
  handover_date: date,
  warranty_end: date,
  project_id: uuid.nullable().optional(),
  notes: opt(4000),
});
export type SiteInput = z.input<typeof siteSchema>;

export const newTicketSchema = z.object({
  subject: z.string().trim().min(1, "Write a short subject").max(300),
  priority: priorityEnum,
  category_id: uuid.nullable(),
  customer_id: uuid.nullable(),
  contact_id: uuid.nullable(),
  site_id: uuid.nullable(),
  assigned_to: uuid.nullable(),
  /** What the customer reported (saved as their first message). */
  report: z.string().trim().max(20000).optional(),
});
export type NewTicketInput = z.input<typeof newTicketSchema>;

export const ticketPatchSchema = z
  .object({
    subject: z.string().trim().min(1).max(300),
    status: statusEnum,
    priority: priorityEnum,
    category_id: uuid.nullable(),
    customer_id: uuid.nullable(),
    contact_id: uuid.nullable(),
    site_id: uuid.nullable(),
    assigned_to: uuid.nullable(),
  })
  .partial();
export type TicketPatch = z.input<typeof ticketPatchSchema>;

export const messageSchema = z.object({
  ticket_id: uuid,
  kind: z.enum(["reply", "note", "customer"]),
  body: z.string().trim().min(1, "Write something first").max(20000),
  /** For "customer": who said it (e.g. on the phone). */
  from_name: opt(160),
  /** Optional: change the status at the same time (e.g. reply and set Waiting for customer). */
  status: statusEnum.optional(),
});
export type MessageInput = z.input<typeof messageSchema>;

export const ticketFileSchema = z.object({
  ticket_id: uuid,
  id: uuid,
  message_id: uuid.nullable().optional(),
  file_name: z.string().trim().min(1).max(200),
  mime_type: z.string().max(120),
  size: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024, "Files must be under 25 MB"),
});
export type TicketFileInput = z.input<typeof ticketFileSchema>;
