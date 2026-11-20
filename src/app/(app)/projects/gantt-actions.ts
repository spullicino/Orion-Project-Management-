"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveProfile, requireRole } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { LOGO_MAX_BYTES, LOGO_TYPES, milestoneSchema, shareLinkSchema } from "@/lib/validation/projects";
import type { Result } from "./actions";

const uuid = z.string().uuid();
const fail = (error: string): Result<never> => ({ ok: false, error });
const friendly = (m: string) => (/row-level security|permission denied/i.test(m) ? "You don't have permission to do that." : m);
const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`, "layout");

// ---------------------------------------------------------------------------
// Milestones (managers)
// ---------------------------------------------------------------------------

export async function saveMilestone(projectId: string, milestoneId: string | null, input: unknown): Promise<Result> {
  const me = await requireRole("manager");
  if (!uuid.safeParse(projectId).success) return fail("Invalid project");
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form");
  const supabase = await createClient();
  const { error } = milestoneId
    ? await supabase.from("milestones").update(parsed.data).eq("id", milestoneId).eq("project_id", projectId)
    : await supabase.from("milestones").insert({ ...parsed.data, project_id: projectId, created_by: me.id });
  if (error) return fail(friendly(error.message));
  refresh(projectId);
  return { ok: true, message: milestoneId ? "Milestone saved" : "Milestone added" };
}

export async function deleteMilestone(projectId: string, milestoneId: string): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(milestoneId).success) return fail("Invalid milestone");
  const supabase = await createClient();
  const { error } = await supabase.from("milestones").delete().eq("id", milestoneId).eq("project_id", projectId);
  if (error) return fail(friendly(error.message));
  refresh(projectId);
  return { ok: true, message: "Milestone deleted" };
}

// ---------------------------------------------------------------------------
// Client share links (managers)
// ---------------------------------------------------------------------------

export type ShareLink = {
  id: string;
  token: string;
  label: string | null;
  hide_owners: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
};

export async function listShareLinks(projectId: string): Promise<Result<ShareLink[]>> {
  await requireRole("manager");
  if (!uuid.safeParse(projectId).success) return fail("Invalid project");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("share_links")
    .select("id, token, label, hide_owners, expires_at, revoked_at, last_viewed_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return fail(friendly(error.message));
  return { ok: true, data: (data ?? []) as ShareLink[] };
}

export async function createShareLink(input: unknown): Promise<Result<ShareLink>> {
  const me = await requireRole("manager");
  const parsed = shareLinkSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form");
  const { project_id, label, expires_in_days, hide_owners } = parsed.data;
  const supabase = await createClient();
  const expires_at = expires_in_days ? new Date(Date.now() + expires_in_days * 86_400_000).toISOString() : null;
  const { data, error } = await supabase
    .from("share_links")
    .insert({ project_id, label, hide_owners, hide_internal_notes: true, expires_at, created_by: me.id })
    .select("id, token, label, hide_owners, expires_at, revoked_at, last_viewed_at, created_at")
    .single();
  if (error) return fail(friendly(error.message));
  return { ok: true, data: data as ShareLink, message: "Link created" };
}

export async function revokeShareLink(linkId: string): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(linkId).success) return fail("Invalid link");
  const supabase = await createClient();
  const { error } = await supabase.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("id", linkId);
  if (error) return fail(friendly(error.message));
  return { ok: true, message: "Link turned off. The client can no longer open it." };
}

// ---------------------------------------------------------------------------
// Client logos (managers) — private "branding" bucket, shown via signed URLs
// ---------------------------------------------------------------------------

export async function createClientLogoUpload(clientId: string, input: { contentType: string; size: number }): Promise<Result<{ path: string; token: string }>> {
  const me = await requireRole("manager");
  if (!uuid.safeParse(clientId).success) return fail("Invalid client");
  if (!LOGO_TYPES.includes(input.contentType as (typeof LOGO_TYPES)[number])) return fail("Please choose a PNG, JPG, WebP or SVG logo.");
  if (!(input.size > 0) || input.size > LOGO_MAX_BYTES) return fail("Logos can be up to 2 MB.");
  if (!(await rateLimit("upload", me.id))) return fail("Too many uploads. Please wait a few minutes.");
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" }[input.contentType]!;
  const path = `clients/${clientId}/logo-${Date.now()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("branding").createSignedUploadUrl(path);
  if (error || !data) return fail("Upload is not available right now.");
  return { ok: true, data: { path: data.path, token: data.token } };
}

export async function saveClientLogo(clientId: string, path: string | null): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(clientId).success) return fail("Invalid client");
  if (path !== null && !path.startsWith(`clients/${clientId}/`)) return fail("Invalid file");
  const supabase = await createClient();
  const { data: before } = await supabase.from("clients").select("logo_path").eq("id", clientId).maybeSingle();
  const { error } = await supabase.from("clients").update({ logo_path: path }).eq("id", clientId);
  if (error) return fail(friendly(error.message));
  if (before?.logo_path && before.logo_path !== path) await supabase.storage.from("branding").remove([before.logo_path]);
  revalidatePath("/clients");
  return { ok: true, message: path ? "Logo saved" : "Logo removed" };
}

/** Short-lived URL for a client's logo (used in exports). */
export async function getClientLogoUrl(clientId: string): Promise<Result<{ url: string | null }>> {
  await requireActiveProfile();
  if (!uuid.safeParse(clientId).success) return fail("Invalid client");
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("logo_path").eq("id", clientId).maybeSingle();
  if (!data?.logo_path) return { ok: true, data: { url: null } };
  const { data: signed } = await supabase.storage.from("branding").createSignedUrl(data.logo_path, 600);
  return { ok: true, data: { url: signed?.signedUrl ?? null } };
}
