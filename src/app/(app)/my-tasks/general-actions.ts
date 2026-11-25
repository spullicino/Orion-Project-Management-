"use server";

import { revalidatePath } from "next/cache";
import { requireActiveProfile, requireRole } from "@/lib/auth/session";
import { queuePush } from "@/lib/notify/queue";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import { generalCommentSchema, generalTaskCreateSchema, generalTaskPatchSchema } from "@/lib/validation/general-tasks";
import type { GeneralTask, GeneralTaskComment } from "@/types/general-tasks";
import type { Json } from "@/types/database";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error: /does not exist|schema cache/.test(error) ? "Run database update 0026 first." : error });

/** General tasks I'm on or gave out (administrators: `all` lists every one). */
export async function loadGeneralTasks(all = false): Promise<Result<GeneralTask[]>> {
  await requireActiveProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_general_tasks", { p_all: all });
  if (error) return fail(error.message);
  return { ok: true, data: (data ?? []) as unknown as GeneralTask[] };
}

/** Managers and administrators: create a general task and give it to colleagues. */
export async function createGeneralTask(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireRole("manager");
  const parsed = generalTaskCreateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the task");
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("general_tasks")
    .insert({ title: d.title, description: d.description || null, client_id: d.client_id || null, due_date: d.due_date || null, priority: d.priority, created_by: me.id })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "Couldn't create the task");
  const { error: aErr } = await supabase.from("general_task_assignees").insert([...new Set(d.assignee_ids)].map((user_id) => ({ task_id: data.id, user_id })));
  if (aErr) return fail(aErr.message);
  queuePush();
  revalidatePath("/my-tasks");
  return { ok: true, data: { id: data.id } };
}

/** Change a general task. Assignees may change status and checklist; the creator everything. */
export async function updateGeneralTask(id: string, patch: unknown): Promise<Result> {
  await requireActiveProfile();
  const parsed = generalTaskPatchSchema.safeParse(patch);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the task");
  const { checklist, ...rest } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("general_tasks")
    .update({ ...rest, ...(checklist ? { checklist: checklist as unknown as Json } : {}) })
    .eq("id", id)
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("You can't change this task.");
  queuePush();
  revalidatePath("/my-tasks");
  return { ok: true };
}

/** Creator / administrator: set exactly who the task is for. */
export async function setGeneralTaskAssignees(id: string, userIds: string[]): Promise<Result> {
  await requireRole("manager");
  if (!userIds.length) return fail("Choose who should do it");
  const supabase = await createClient();
  const { data: current, error } = await supabase.from("general_task_assignees").select("user_id").eq("task_id", id);
  if (error) return fail(error.message);
  const now = new Set((current ?? []).map((r) => r.user_id));
  const want = new Set(userIds);
  const add = [...want].filter((u) => !now.has(u));
  const remove = [...now].filter((u) => !want.has(u));
  if (add.length) {
    const { error: e } = await supabase.from("general_task_assignees").insert(add.map((user_id) => ({ task_id: id, user_id })));
    if (e) return fail(e.message);
  }
  if (remove.length) {
    const { error: e } = await supabase.from("general_task_assignees").delete().eq("task_id", id).in("user_id", remove);
    if (e) return fail(e.message);
  }
  queuePush();
  revalidatePath("/my-tasks");
  return { ok: true };
}

export async function deleteGeneralTask(id: string): Promise<Result> {
  await requireActiveProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from("general_tasks").delete().eq("id", id).select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("Only the person who created this task can delete it.");
  revalidatePath("/my-tasks");
  return { ok: true };
}

export async function loadGeneralTaskComments(taskId: string): Promise<Result<GeneralTaskComment[]>> {
  await requireActiveProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.from("general_task_comments").select("id, body, created_at, author_id").eq("task_id", taskId).order("created_at");
  if (error) return fail(error.message);
  const ids = [...new Set((data ?? []).map((c) => c.author_id).filter((x): x is string => !!x))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, fullName(p)]));
  return { ok: true, data: (data ?? []).map((c) => ({ ...c, author_name: (c.author_id && names.get(c.author_id)) || "Someone" })) };
}

export async function addGeneralTaskComment(input: unknown): Promise<Result> {
  const me = await requireActiveProfile();
  const parsed = generalCommentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Write a comment");
  const supabase = await createClient();
  const { error } = await supabase.from("general_task_comments").insert({ task_id: parsed.data.task_id, body: parsed.data.body, author_id: me.id });
  if (error) return fail(error.message);
  queuePush();
  return { ok: true };
}
