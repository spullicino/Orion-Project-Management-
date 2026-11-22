import { z } from "zod";

const uuid = z.string().uuid();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
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

export const MAX_MATERIAL_PHOTOS = 10;
export const MATERIAL_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export const materialItemSchema = z.object({
  name: z.string().trim().min(1, "Write what you need").max(200),
  quantity: z.coerce.number({ message: "Enter a quantity" }).positive("The quantity must be more than 0").max(1_000_000),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  note: optionalText(300),
});

export const createMaterialSchema = z.object({
  id: uuid,
  project_id: uuid,
  needed_by: optionalDate,
  urgent: z.boolean().default(false),
  delivery_note: optionalText(1000),
  items: z.array(materialItemSchema).min(1, "Add at least one item").max(100),
  copied_from: uuid.nullable().optional(),
});

export const editMaterialSchema = createMaterialSchema.pick({ needed_by: true, urgent: true, delivery_note: true, items: true });

export const materialStatusSchema = z
  .object({
    status: z.enum(["requested", "ordered", "partly_delivered", "delivered", "rejected", "cancelled"]),
    supplier: optionalText(200),
    po_number: optionalText(100),
    expected_date: optionalDate,
    reject_reason: optionalText(500),
    deliveries: z.array(z.object({ item_id: uuid, delivered_qty: z.coerce.number().min(0).max(1_000_000) })).max(100).optional(),
  })
  .refine((v) => v.status !== "rejected" || !!v.reject_reason, { path: ["reject_reason"], message: "Say why it's rejected" });

export const materialCommentSchema = z.object({ body: z.string().trim().min(1, "Write something first").max(4000) });

export const materialPhotoTicketSchema = z.object({
  request_id: uuid,
  photos: z
    .array(z.object({ id: uuid, size: z.number().int().positive().max(MATERIAL_PHOTO_MAX_BYTES), thumb_size: z.number().int().positive().max(MATERIAL_PHOTO_MAX_BYTES) }))
    .min(1)
    .max(MAX_MATERIAL_PHOTOS),
});

export const materialPhotoRegisterSchema = z.object({
  request_id: uuid,
  photos: z
    .array(z.object({ id: uuid, width: z.number().int().positive().max(20000), height: z.number().int().positive().max(20000), size: z.number().int().positive() }))
    .min(1)
    .max(MAX_MATERIAL_PHOTOS),
});
