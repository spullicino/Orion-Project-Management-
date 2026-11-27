"use server";

import { z } from "zod";
import type { Result } from "@/app/(app)/projects/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { queuePush } from "@/lib/notify/queue";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";

export type DailyComment = { id: string; author_id: string | null; author: string; body: string; created_at: string; edited_at: string | null };
export type MentionPerson = { id: string; name: string };

const fail = (error: string): Result<never> => ({ ok: false, error });
const uuid = z.string().uuid();
const NEEDS = "Run database update 0038 first.";
const friendly = (m: string) => (/does not exist|schema cache/.test(m) ? NEEDS : /row-level security|permission denied/.test(m) ? "You can't comment on this update." : m);

async function me() {
  const p = await getCurrentProfile();
  return p && p.status === "active" ? p : null;
}

/** How many comments each update has (for the "Comments (2)" buttons). */
export async function getDailyCommentCounts(ids: string[]): Promise<Record<string, number>> {
  if (!(await me())) return {};
  const list = z.array(uuid).max(500).safeParse(ids);
  if (!list.success || !list.data.length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.from("daily_update_comments").select("update_id").in("update_id", list.data).limit(10000);
  if (error) return {};
  const out: Record<string, number> = {};
  for (const c of data ?? []) out[c.update_id] = (out[c.update_id] ?? 0) + 1;
  return out;
}

export async function listDailyComments(updateId: string): Promise<Result<DailyComment[]>> {
  if (!(await me())) return fail("Please sign in again.");
  if (!uuid.safeParse(updateId).success) return fail("Update not found");
  const supabase = await createClient();
  const { data, error } = await supabase.from("daily_update_comments").select("id, author_id, body, created_at, edited_at").eq("update_id", updateId).order("created_at");
  if (error) return fail(friendly(error.message));
  const ids = [...new Set((data ?? []).map((c) => c.author_id).filter(Boolean) as string[])];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, fullName(p)]));
  return { ok: true, data: (data ?? []).map((c) => ({ ...c, author: (c.author_id && name.get(c.author_id)) || "Someone" })) };
}

/** People who can be @mentioned on this update (its project's people). */
export async function dailyCommentPeople(updateId: string): Promise<MentionPerson[]> {
  if (!(await me()) || !uuid.safeParse(updateId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("daily_comment_people", { p_update: updateId });
  return (data ?? []).map((p) => ({ id: p.user_id, name: fullName(p) }));
}

const commentSchema = z.object({ updateId: uuid, body: z.string().trim().min(1, "Write a comment").max(4000), mentions: z.array(uuid).max(50) });

export async function addDailyComment(input: unknown): Promise<Result<{ id: string }>> {
  const p = await me();
  if (!p) return fail("Please sign in again.");
  const v = commentSchema.safeParse(input);
  if (!v.success) return fail(v.error.issues[0]?.message ?? "Check the comment");
  if (!(await rateLimit("chatMessage", p.id))) return fail("Too many comments. Please wait a minute.");
  const supabase = await createClient();
  const { data: u } = await supabase.from("daily_updates").select("project_id").eq("id", v.data.updateId).maybeSingle();
  if (!u) return fail("Update not found");
  const { data, error } = await supabase
    .from("daily_update_comments")
    .insert({ update_id: v.data.updateId, project_id: u.project_id, author_id: p.id, body: v.data.body, mentions: [...new Set(v.data.mentions)] })
    .select("id")
    .single();
  if (error || !data) return fail(friendly(error?.message ?? "Couldn't save"));
  queuePush();
  return { ok: true, data: { id: data.id } };
}

export async function editDailyComment(id: string, body: string): Promise<Result> {
  if (!(await me())) return fail("Please sign in again.");
  const v = z.object({ id: uuid, body: z.string().trim().min(1, "Write a comment").max(4000) }).safeParse({ id, body });
  if (!v.success) return fail(v.error.issues[0]?.message ?? "Check the comment");
  const supabase = await createClient();
  const { data, error } = await supabase.from("daily_update_comments").update({ body: v.data.body }).eq("id", v.data.id).select("id").maybeSingle();
  if (error) return fail(friendly(error.message));
  return data ? { ok: true } : fail("You can only edit your own comments.");
}

export async function deleteDailyComment(id: string): Promise<Result> {
  if (!(await me())) return fail("Please sign in again.");
  if (!uuid.safeParse(id).success) return fail("Comment not found");
  const supabase = await createClient();
  const { data, error } = await supabase.from("daily_update_comments").delete().eq("id", id).select("id").maybeSingle();
  if (error) return fail(friendly(error.message));
  return data ? { ok: true } : fail("Only the person who wrote it, or a manager, can delete it.");
}
