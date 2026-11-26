"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/app/(app)/projects/actions";
import { hasRole } from "@/lib/auth/roles";
import { getCurrentProfile, requireActiveProfile } from "@/lib/auth/session";
import { queuePush } from "@/lib/notify/queue";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { withDocCounts } from "@/lib/data/materials";
import {
  createMaterialSchema,
  editMaterialSchema,
  materialCommentSchema,
  materialPhotoRegisterSchema,
  materialPhotoTicketSchema,
  materialStatusSchema,
} from "@/lib/validation/materials";
import { thumbPath } from "@/types/diary";
import type { MaterialRequestRow } from "@/types/database";
import type { MaterialListItem, MaterialRequestDetail, ProjectMaterial, ReportLine } from "@/types/materials";

const uuid = z.string().uuid();
const fail = (error: string): Result<never> => ({ ok: false, error });
const SIGNED_OUT = "SIGNED_OUT"; // the phone's outbox waits for sign-in when it sees this
const NEEDS_UPDATE = "Material requests need the latest database update (ask your administrator).";

function friendly(m: string) {
  if (/function .* does not exist|schema cache|relation .* does not exist/i.test(m)) return NEEDS_UPDATE;
  if (/row-level security|permission denied/i.test(m)) return "You can't do that on this project.";
  if (/check constraint/i.test(m)) return "Please check the quantities and dates.";
  return m;
}

function refresh(projectId?: string) {
  revalidatePath("/materials");
  if (projectId) revalidatePath(`/projects/${projectId}/materials`);
}

async function posterOrNull() {
  const me = await getCurrentProfile();
  return me && me.status === "active" ? me : null;
}

const photoPaths = (projectId: string, requestId: string, photoId: string) => {
  const full = `${projectId}/materials/${requestId}/${photoId}.jpg`;
  return { full, thumb: thumbPath(full) };
};

// ---------------------------------------------------------------------------
// Sending a request (used by the phone's offline outbox: every step is safe to repeat)
// ---------------------------------------------------------------------------

export async function createMaterialRequest(input: unknown): Promise<Result<{ id: string; number: number; project_id: string }>> {
  const me = await posterOrNull();
  if (!me) return fail(SIGNED_OUT);
  if (!hasRole(me.role, "technician")) return fail("Your level can't request materials.");
  const parsed = createMaterialSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form");
  const v = parsed.data;
  if (!(await rateLimit("materialRequest", me.id))) return fail("Too many requests in a short time. Please wait a little.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_material_request", {
    p_id: v.id,
    p_project: v.project_id,
    p_needed_by: v.needed_by ?? null,
    p_urgent: v.urgent,
    p_note: v.delivery_note ?? "",
    p_items: v.items,
    p_copied_from: v.copied_from ?? null,
  });
  if (error) return fail(friendly(error.message));
  const created = data as unknown as { id: string; number: number; project_id: string };
  refresh(created.project_id);
  queuePush();
  return { ok: true, data: created };
}

export async function createMaterialPhotoUploads(input: unknown): Promise<Result<{ id: string; fullUrl: string; thumbUrl: string }[]>> {
  const me = await posterOrNull();
  if (!me) return fail(SIGNED_OUT);
  const parsed = materialPhotoTicketSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid photos");
  const supabase = await createClient();
  const { data: req } = await supabase.from("material_requests").select("id, project_id").eq("id", parsed.data.request_id).maybeSingle();
  if (!req) return fail("Request not found");
  for (let i = 0; i < parsed.data.photos.length; i++) {
    if (!(await rateLimit("upload", me.id))) return fail("Too many uploads. Please wait a few minutes and it will retry.");
  }
  const tickets: { id: string; fullUrl: string; thumbUrl: string }[] = [];
  for (const p of parsed.data.photos) {
    const paths = photoPaths(req.project_id, req.id, p.id);
    const [full, thumb] = await Promise.all([
      supabase.storage.from("project-files").createSignedUploadUrl(paths.full, { upsert: true }),
      supabase.storage.from("project-files").createSignedUploadUrl(paths.thumb, { upsert: true }),
    ]);
    if (full.error || thumb.error || !full.data || !thumb.data) return fail("You can't upload photos to this project.");
    tickets.push({ id: p.id, fullUrl: full.data.signedUrl, thumbUrl: thumb.data.signedUrl });
  }
  return { ok: true, data: tickets };
}

export async function registerMaterialPhotos(input: unknown): Promise<Result> {
  const me = await posterOrNull();
  if (!me) return fail(SIGNED_OUT);
  const parsed = materialPhotoRegisterSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid photos");
  const supabase = await createClient();
  const { data: req } = await supabase.from("material_requests").select("id, project_id").eq("id", parsed.data.request_id).maybeSingle();
  if (!req) return fail("Request not found");
  const rows = parsed.data.photos.map((p) => ({
    id: p.id,
    request_id: req.id,
    project_id: req.project_id,
    storage_path: photoPaths(req.project_id, req.id, p.id).full,
    width: p.width,
    height: p.height,
    size_bytes: p.size,
    uploaded_by: me.id,
  }));
  const { error } = await supabase.from("material_request_photos").upsert(rows, { onConflict: "storage_path", ignoreDuplicates: true });
  if (error) return fail(friendly(error.message));
  refresh(req.project_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function loadMaterialRequests(projectId: string | null, openOnly = false): Promise<Result<MaterialListItem[]>> {
  await requireActiveProfile();
  if (projectId && !uuid.safeParse(projectId).success) return fail("Invalid project");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_material_requests", { p_project: projectId, p_open_only: openOnly });
  if (error) return fail(friendly(error.message));
  return { ok: true, data: await withDocCounts(supabase, (data ?? []) as unknown as MaterialListItem[]) };
}

export async function loadMaterialRequest(id: string): Promise<Result<MaterialRequestDetail | null>> {
  await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid request");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_material_request", { p_id: id });
  if (error) return fail(friendly(error.message));
  if (!data) return { ok: true, data: null };
  const detail = data as unknown as MaterialRequestDetail;
  const paths = detail.photos.flatMap((p) => [p.storage_path, thumbPath(p.storage_path)]);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("project-files").createSignedUrls(paths, 60 * 60 * 2);
    const urls = new Map((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]));
    detail.photos = detail.photos.map((p) => ({ ...p, url: urls.get(p.storage_path) ?? null, thumb_url: urls.get(thumbPath(p.storage_path)) ?? null }));
  }
  // Delivery notes / invoices (database update 0029; before it this is simply empty).
  const { data: docs } = await supabase
    .from("material_request_documents")
    .select("id, kind, file_name, mime_type, size_bytes, uploaded_by, created_at")
    .eq("request_id", id)
    .order("created_at");
  if (docs?.length) {
    const ids = [...new Set(docs.map((d) => d.uploaded_by).filter((x): x is string => !!x))];
    const { data: people } = ids.length ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids) : { data: [] };
    const name = new Map((people ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim() || p.email]));
    detail.documents = docs.map((d) => ({ ...d, uploaded_by_name: (d.uploaded_by && name.get(d.uploaded_by)) || "Someone" }));
  } else detail.documents = [];
  return { ok: true, data: detail };
}

export async function loadProjectMaterials(projectId: string): Promise<Result<ProjectMaterial[]>> {
  await requireActiveProfile();
  if (!uuid.safeParse(projectId).success) return fail("Invalid project");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_materials", { p_project: projectId });
  if (error) return fail(friendly(error.message));
  return { ok: true, data: (data ?? []) as unknown as ProjectMaterial[] };
}

// ---------------------------------------------------------------------------
// Changing (permissions are enforced by the database)
// ---------------------------------------------------------------------------

/** Managers: ordered / delivered (all or some) / rejected. Requesters: cancel while it's waiting. */
export async function updateMaterialStatus(id: string, input: unknown): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid request");
  const parsed = materialStatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form");
  const v = parsed.data;
  const supabase = await createClient();

  // Delivered quantities first (managers only; the database ignores them for anyone else).
  if (v.status === "delivered" || v.status === "partly_delivered") {
    const { data: items, error: itemsError } = await supabase.from("material_request_items").select("id, quantity").eq("request_id", id);
    if (itemsError) return fail(friendly(itemsError.message));
    const given = new Map((v.deliveries ?? []).map((d) => [d.item_id, d.delivered_qty]));
    for (const it of items ?? []) {
      const qty = given.has(it.id) ? given.get(it.id)! : v.status === "delivered" ? Number(it.quantity) : undefined;
      if (qty === undefined) continue;
      const { error } = await supabase.from("material_request_items").update({ delivered_qty: qty }).eq("id", it.id);
      if (error) return fail(friendly(error.message));
    }
  }

  const patch: Partial<MaterialRequestRow> = { status: v.status };
  if (v.status === "ordered") Object.assign(patch, { supplier: v.supplier ?? null, po_number: v.po_number ?? null, expected_date: v.expected_date ?? null });
  if (v.status === "rejected") patch.reject_reason = v.reject_reason ?? null;
  const { data, error } = await supabase.from("material_requests").update(patch).eq("id", id).select("project_id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("You can't change this request.");
  refresh(data[0].project_id);
  queuePush();
  return { ok: true };
}

/** Change the items, date or notes while the request is still waiting. */
export async function editMaterialRequest(id: string, input: unknown): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid request");
  const parsed = editMaterialSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form");
  const v = parsed.data;
  const supabase = await createClient();
  const { data: req } = await supabase.from("material_requests").select("project_id, status").eq("id", id).maybeSingle();
  if (!req) return fail("Request not found");
  if (req.status !== "requested") return fail("This request is already being handled — it can't be changed now.");
  const { data, error } = await supabase
    .from("material_requests")
    .update({ needed_by: v.needed_by ?? null, urgent: v.urgent, delivery_note: v.delivery_note ?? null })
    .eq("id", id)
    .select("id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("You can't change this request.");
  const del = await supabase.from("material_request_items").delete().eq("request_id", id);
  if (del.error) return fail(friendly(del.error.message));
  const ins = await supabase.from("material_request_items").insert(v.items.map((it, i) => ({ ...it, request_id: id, position: i + 1 })));
  if (ins.error) return fail(friendly(ins.error.message));
  refresh(req.project_id);
  return { ok: true };
}

export async function addMaterialComment(id: string, input: unknown): Promise<Result> {
  const me = await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid request");
  const parsed = materialCommentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write something first");
  if (!(await rateLimit("chatMessage", me.id))) return fail("You're commenting very fast. Please wait a moment.");
  const supabase = await createClient();
  const { error } = await supabase.from("material_request_comments").insert({ request_id: id, author_id: me.id, body: parsed.data.body });
  if (error) return fail(friendly(error.message));
  queuePush();
  return { ok: true };
}

/** Materials report for a project: delivered quantities per product, optionally between two dates. */
export async function loadMaterialReport(projectId: string, from?: string | null, to?: string | null): Promise<Result<ReportLine[]>> {
  await requireActiveProfile();
  if (!uuid.safeParse(projectId).success) return fail("Invalid project");
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
  if (!date.safeParse(from).success || !date.safeParse(to).success) return fail("Invalid dates");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_material_report", { p_project: projectId, p_from: from || null, p_to: to || null });
  if (error) return fail(friendly(error.message));
  return { ok: true, data: (data ?? []) as unknown as ReportLine[] };
}

// ---------------------------------------------------------------------------
// Delivery documents and "received on site" (database update 0029)
// ---------------------------------------------------------------------------

const DOC_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
const docUploadSchema = z.object({
  request_id: uuid,
  id: uuid,
  file_name: z.string().trim().min(1).max(200),
  mime_type: z.string().regex(DOC_TYPES, "Photos or PDF files only"),
  size: z.number().int().positive().max(25 * 1024 * 1024, "Files must be under 25 MB"),
  kind: z.enum(["delivery_note", "invoice", "other"]),
});
const docPath = (projectId: string, requestId: string, id: string, fileName: string) =>
  `${projectId}/materials/${requestId}/docs/${id}-${fileName.replace(/[^\w.\- ]+/g, "_").slice(-80)}`;
const needs0029 = (m: string) => /material_request_documents|receive_material_request|does not exist|schema cache/.test(m);

/** Step 1: a one-time link the phone uploads the photo or PDF to. */
export async function createMaterialDocumentUpload(input: unknown): Promise<Result<{ signedUrl: string }>> {
  const me = await posterOrNull();
  if (!me) return fail(SIGNED_OUT);
  const parsed = docUploadSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid file");
  if (!(await rateLimit("upload", me.id))) return fail("Too many uploads. Please wait a few minutes.");
  const supabase = await createClient();
  const { data: req } = await supabase.from("material_requests").select("id, project_id").eq("id", parsed.data.request_id).maybeSingle();
  if (!req) return fail("Request not found");
  const { data, error } = await supabase.storage
    .from("project-files")
    .createSignedUploadUrl(docPath(req.project_id, req.id, parsed.data.id, parsed.data.file_name), { upsert: true });
  if (error || !data) return fail("You can't add files to this project.");
  return { ok: true, data: { signedUrl: data.signedUrl } };
}

/** Step 2: once uploaded, record it on the request (managers are told). */
export async function registerMaterialDocument(input: unknown): Promise<Result> {
  const me = await posterOrNull();
  if (!me) return fail(SIGNED_OUT);
  const parsed = docUploadSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid file");
  const v = parsed.data;
  const supabase = await createClient();
  const { data: req } = await supabase.from("material_requests").select("id, project_id").eq("id", v.request_id).maybeSingle();
  if (!req) return fail("Request not found");
  const { error } = await supabase.from("material_request_documents").upsert(
    {
      id: v.id,
      request_id: req.id,
      project_id: req.project_id,
      kind: v.kind,
      storage_path: docPath(req.project_id, req.id, v.id, v.file_name),
      file_name: v.file_name,
      mime_type: v.mime_type,
      size_bytes: v.size,
      uploaded_by: me.id,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) return fail(needs0029(error.message) ? "Run database update 0029 first." : friendly(error.message));
  refresh(req.project_id);
  queuePush();
  return { ok: true };
}

export async function deleteMaterialDocument(id: string): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid file");
  const supabase = await createClient();
  const { data, error } = await supabase.from("material_request_documents").delete().eq("id", id).select("project_id, storage_path");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("Only the person who added it or a manager can remove it.");
  await supabase.storage.from("project-files").remove([data[0].storage_path]);
  refresh(data[0].project_id);
  return { ok: true };
}

const receiveSchema = z.object({
  deliveries: z.array(z.object({ item_id: uuid, delivered_qty: z.number().min(0).max(1_000_000) })).max(200),
  note: z.string().trim().max(4000).optional(),
});

/** On site: "received" with the quantities that came (technicians too). */
export async function receiveMaterialRequest(id: string, input: unknown): Promise<Result<{ status: string }>> {
  await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid request");
  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the quantities");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_material_request", { p_id: id, p_deliveries: parsed.data.deliveries, p_note: parsed.data.note ?? null });
  if (error) return fail(needs0029(error.message) ? "Run database update 0029 first." : friendly(error.message));
  const { data: r } = await supabase.from("material_requests").select("project_id").eq("id", id).maybeSingle();
  refresh(r?.project_id);
  queuePush();
  return { ok: true, data: { status: String(data) } };
}
