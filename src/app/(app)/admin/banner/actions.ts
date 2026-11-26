"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { bannerSchema, type BannerInput } from "@/lib/validation/banner";

type Result = { ok: true } | { ok: false; error: string };
const friendly = (m: string) => (/does not exist|schema cache/.test(m) ? "Run database update 0032 first." : m);
const done = (): Result => {
  revalidatePath("/", "layout"); // the banner is on every page
  return { ok: true };
};

/** Administrators: add a banner message (id null) or change one. */
export async function saveBanner(id: string | null, input: BannerInput): Promise<Result> {
  await requireRole("admin");
  const parsed = bannerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the message" };
  const { body, link, tone, startsAt, endsAt, audience } = parsed.data;
  const row = {
    body,
    link,
    tone,
    starts_at: startsAt,
    ends_at: endsAt,
    audience_type: audience.type,
    audience_roles: audience.type === "levels" ? audience.roles : [],
    audience_projects: audience.type === "projects" ? audience.projectIds : [],
    audience_people: audience.type === "people" ? audience.userIds : [],
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("banner_messages").update(row).eq("id", id);
    if (error) return { ok: false, error: friendly(error.message) };
    return done();
  }
  const { data: last } = await supabase.from("banner_messages").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("banner_messages").insert({ ...row, position: (last?.position ?? 0) + 1 });
  if (error) return { ok: false, error: friendly(error.message) };
  return done();
}

export async function setBannerPaused(id: string, paused: boolean): Promise<Result> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("banner_messages").update({ paused }).eq("id", id);
  return error ? { ok: false, error: friendly(error.message) } : done();
}

/** Stop showing it now (keeps it in the list as Ended). */
export async function endBanner(id: string): Promise<Result> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data } = await supabase.from("banner_messages").select("starts_at").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "Message not found" };
  const now = new Date();
  // A scheduled one that hasn't started yet: end it straight after its start so the dates stay valid.
  const startsAt = new Date(data.starts_at);
  const patch = startsAt >= now ? { starts_at: now.toISOString(), ends_at: new Date(+now + 1000).toISOString() } : { ends_at: now.toISOString() };
  const { error } = await supabase.from("banner_messages").update(patch).eq("id", id);
  return error ? { ok: false, error: friendly(error.message) } : done();
}

export async function deleteBanner(id: string): Promise<Result> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("banner_messages").delete().eq("id", id);
  return error ? { ok: false, error: friendly(error.message) } : done();
}

/** Show this message earlier (-1) or later (+1) in the rotation. */
export async function moveBanner(id: string, dir: -1 | 1): Promise<Result> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("banner_messages").select("id, position, created_at, ends_at").order("position").order("created_at");
  if (error) return { ok: false, error: friendly(error.message) };
  // Only the ones still showing or to come — ended ones don't take part.
  const now = Date.now();
  const list = (data ?? []).filter((b) => !b.ends_at || new Date(b.ends_at).getTime() > now);
  const i = list.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  // Renumber everything so equal positions can't get stuck.
  for (const [n, b] of list.entries()) {
    if (b.position !== n + 1) {
      const { error: e } = await supabase.from("banner_messages").update({ position: n + 1 }).eq("id", b.id);
      if (e) return { ok: false, error: friendly(e.message) };
    }
  }
  return done();
}
