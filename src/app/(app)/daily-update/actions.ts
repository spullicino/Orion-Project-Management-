"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/app/(app)/projects/actions";
import { hasRole } from "@/lib/auth/roles";
import { getCurrentProfile, requireActiveProfile, requireRole } from "@/lib/auth/session";
import { getDailyFeed, getDailyStatus, getProjectPhotos } from "@/lib/data/diary";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { dailyUpdateEditSchema, dailyUpdateSchema, photoRegisterSchema, photoTicketSchema, reportSchema } from "@/lib/validation/diary";
import { thumbPath, type DailyStatus, type DailyUpdate, type FeedQuery, type GalleryPhoto } from "@/types/diary";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fail = (error: string): Result<never> => ({ ok: false, error });
const friendly = (m: string) =>
  /row-level security|permission denied/i.test(m)
    ? "You can't post or change updates on this project (or the 24-hour editing window has passed)."
    : m;

function refresh(projectId?: string) {
  revalidatePath("/daily-update", "layout");
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

/** The phone's outbox calls these in the background: never redirect, just say "signed out" so it waits. */
const SIGNED_OUT = "SIGNED_OUT"; // the outbox recognises this text (src/lib/offline/sync.ts)
async function posterOrNull() {
  const me = await getCurrentProfile();
  return me && me.status === "active" ? me : null;
}

const photoPaths = (projectId: string, updateId: string, photoId: string) => {
  const full = `${projectId}/daily/${updateId}/${photoId}.jpg`;
  return { full, thumb: thumbPath(full) };
};

// ---------------------------------------------------------------------------
// Posting (used by the offline outbox, so every step is safe to repeat)
// ---------------------------------------------------------------------------

/** Creates the update, or returns the existing one if this phone already sent it (same client_ref). */
export async function createDailyUpdate(input: unknown): Promise<Result<{ id: string; project_id: string }>> {
  const me = await posterOrNull();
  if (!me) return fail(SIGNED_OUT);
  if (!hasRole(me.role, "technician")) return fail("Your level can't post daily updates.");
  const parsed = dailyUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form");
  const v = parsed.data;
  // Allow a day of slack for time zones; never a date in the future beyond that.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (v.work_date > tomorrow) return fail("The date can't be in the future.");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("daily_updates")
    .select("id, project_id, author_id")
    .eq("client_ref", v.client_ref)
    .maybeSingle();
  if (existing) {
    if (existing.author_id !== me.id) return fail("This update could not be saved. Please try again.");
    return { ok: true, data: { id: existing.id, project_id: existing.project_id } };
  }

  if (!(await rateLimit("dailyPost", me.id))) return fail("Too many updates in a short time. Please wait a little.");
  const { data, error } = await supabase
    .from("daily_updates")
    .insert({ ...v, author_id: me.id })
    .select("id, project_id")
    .single();
  if (error) return fail(friendly(error.message));
  refresh(data.project_id);
  return { ok: true, data };
}

/** Signed upload URLs (valid 2 hours) for each photo's full-size and thumbnail versions. */
export async function createPhotoUploads(input: unknown): Promise<Result<{ id: string; fullUrl: string; thumbUrl: string }[]>> {
  const me = await posterOrNull();
  if (!me) return fail(SIGNED_OUT);
  const parsed = photoTicketSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid photos");
  const supabase = await createClient();
  const { data: update } = await supabase.from("daily_updates").select("id, project_id, author_id").eq("id", parsed.data.update_id).maybeSingle();
  if (!update) return fail("Update not found");
  if (update.author_id !== me.id && !hasRole(me.role, "manager")) return fail("You can only add photos to your own updates.");
  for (let i = 0; i < parsed.data.photos.length; i++) {
    if (!(await rateLimit("upload", me.id))) return fail("Too many uploads. Please wait a few minutes and it will retry.");
  }

  const tickets: { id: string; fullUrl: string; thumbUrl: string }[] = [];
  for (const p of parsed.data.photos) {
    const paths = photoPaths(update.project_id, update.id, p.id);
    const [full, thumb] = await Promise.all([
      supabase.storage.from("project-files").createSignedUploadUrl(paths.full, { upsert: true }),
      supabase.storage.from("project-files").createSignedUploadUrl(paths.thumb, { upsert: true }),
    ]);
    if (full.error || thumb.error || !full.data || !thumb.data) return fail("You can't upload photos to this project.");
    tickets.push({ id: p.id, fullUrl: full.data.signedUrl, thumbUrl: thumb.data.signedUrl });
  }
  return { ok: true, data: tickets };
}

/** Records uploaded photos against the update (ignores ones already recorded). */
export async function registerPhotos(input: unknown): Promise<Result> {
  const me = await posterOrNull();
  if (!me) return fail(SIGNED_OUT);
  const parsed = photoRegisterSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid photos");
  const supabase = await createClient();
  const { data: update } = await supabase.from("daily_updates").select("id, project_id").eq("id", parsed.data.update_id).maybeSingle();
  if (!update) return fail("Update not found");
  const rows = parsed.data.photos.map((p) => ({
    id: p.id,
    daily_update_id: update.id,
    project_id: update.project_id,
    storage_path: photoPaths(update.project_id, update.id, p.id).full,
    width: p.width,
    height: p.height,
    size_bytes: p.size,
    uploaded_by: me.id,
  }));
  const { error } = await supabase.from("daily_update_photos").upsert(rows, { onConflict: "storage_path", ignoreDuplicates: true });
  if (error) return fail(friendly(error.message));
  refresh(update.project_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Editing & deleting (author within 24 hours, or managers — enforced by RLS)
// ---------------------------------------------------------------------------

export async function updateDailyUpdate(id: string, input: unknown): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid update");
  const parsed = dailyUpdateEditSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form");
  const supabase = await createClient();
  const { data, error } = await supabase.from("daily_updates").update(parsed.data).eq("id", id).select("project_id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail(friendly("permission denied"));
  refresh(data[0].project_id);
  return { ok: true, message: "Update saved" };
}

export async function deleteDailyUpdate(id: string): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid update");
  const supabase = await createClient();
  const { data: photos } = await supabase.from("daily_update_photos").select("storage_path").eq("daily_update_id", id);
  const { data, error } = await supabase.from("daily_updates").delete().eq("id", id).select("project_id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail(friendly("permission denied"));
  const paths = (photos ?? []).flatMap((p) => [p.storage_path, thumbPath(p.storage_path)]);
  if (paths.length) await supabase.storage.from("project-files").remove(paths);
  refresh(data[0].project_id);
  return { ok: true, message: "Update deleted" };
}

export async function deletePhoto(photoId: string): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(photoId).success) return fail("Invalid photo");
  const supabase = await createClient();
  const { data, error } = await supabase.from("daily_update_photos").delete().eq("id", photoId).select("storage_path, project_id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail(friendly("permission denied"));
  await supabase.storage.from("project-files").remove([data[0].storage_path, thumbPath(data[0].storage_path)]);
  refresh(data[0].project_id);
  return { ok: true, message: "Photo removed" };
}

// ---------------------------------------------------------------------------
// Reading (load more / filters / reports)
// ---------------------------------------------------------------------------

const feedQuerySchema = z.object({
  project: uuid.nullable().optional(),
  from: isoDate.nullable().optional(),
  to: isoDate.nullable().optional(),
  author: uuid.nullable().optional(),
  before: z.object({ date: isoDate, created: z.string().max(40) }).nullable().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function loadFeed(q: FeedQuery): Promise<Result<DailyUpdate[]>> {
  await requireActiveProfile();
  const parsed = feedQuerySchema.safeParse(q);
  if (!parsed.success) return fail("Invalid filters");
  try {
    return { ok: true, data: await getDailyFeed(parsed.data) };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function loadPhotos(q: { project: string; from?: string | null; to?: string | null; before?: string | null }): Promise<Result<GalleryPhoto[]>> {
  await requireActiveProfile();
  const parsed = z
    .object({ project: uuid, from: isoDate.nullable().optional(), to: isoDate.nullable().optional(), before: z.string().max(40).nullable().optional() })
    .safeParse(q);
  if (!parsed.success) return fail("Invalid filters");
  try {
    return { ok: true, data: await getProjectPhotos(parsed.data) };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function loadDailyStatus(date: string): Promise<Result<DailyStatus>> {
  await requireRole("manager");
  if (!isoDate.safeParse(date).success) return fail("Invalid date");
  try {
    return { ok: true, data: (await getDailyStatus(date)) ?? [] };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Everything a PDF report needs for one project and date range (managers). */
export async function getReportData(input: unknown): Promise<Result<DailyUpdate[]>> {
  await requireRole("manager");
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the dates");
  const { project_id, from, to, author } = parsed.data;
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 186) return fail("Please choose a period of 6 months or less.");
  try {
    const updates: DailyUpdate[] = [];
    let before: FeedQuery["before"] = null;
    // Up to 500 updates, fetched in pages.
    for (let i = 0; i < 10; i++) {
      const page = await getDailyFeed({ project: project_id, from, to, author: author ?? null, before, limit: 50 });
      updates.push(...page);
      if (page.length < 50) break;
      const last = page[page.length - 1];
      before = { date: last.work_date, created: last.created_at };
    }
    return { ok: true, data: updates };
  } catch (e) {
    return fail((e as Error).message);
  }
}
