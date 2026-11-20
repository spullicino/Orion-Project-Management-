"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/app/(app)/projects/actions";
import { requireActiveProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type PersonalTodo = { id: string; title: string; due_date: string | null; done_at: string | null; position: number; created_at: string };
export type PersonalNote = { id: string; title: string; body: string; color: string; pinned: boolean; created_at: string; updated_at: string };

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fail = (error: string): Result<never> => ({ ok: false, error });
const done = (): Result => {
  revalidatePath("/personal");
  return { ok: true };
};

// Every query runs as the signed-in person; the database only ever returns their own rows.

export async function loadPersonal(): Promise<{ todos: PersonalTodo[]; notes: PersonalNote[] }> {
  await requireActiveProfile();
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [todos, notes] = await Promise.all([
    supabase
      .from("personal_todos")
      .select("id, title, due_date, done_at, position, created_at")
      .or(`done_at.is.null,done_at.gt.${since}`)
      .order("position")
      .limit(500),
    supabase.from("personal_notes").select("id, title, body, color, pinned, created_at, updated_at").order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(500),
  ]);
  if (todos.error || notes.error) throw new Error((todos.error ?? notes.error)!.message);
  return { todos: (todos.data ?? []) as PersonalTodo[], notes: (notes.data ?? []) as PersonalNote[] };
}

export async function addTodo(input: { title: string; due_date?: string | null }): Promise<Result<PersonalTodo>> {
  const me = await requireActiveProfile();
  const parsed = z.object({ title: z.string().trim().min(1, "Type something to do").max(300), due_date: isoDate.nullable().optional() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid to-do");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_todos")
    .insert({ ...parsed.data, user_id: me.id, position: Date.now() / 1000 })
    .select("id, title, due_date, done_at, position, created_at")
    .single();
  if (error) return fail(error.message);
  revalidatePath("/personal");
  return { ok: true, data: data as PersonalTodo };
}

export async function updateTodo(id: string, patch: { title?: string; due_date?: string | null; done?: boolean }): Promise<Result> {
  await requireActiveProfile();
  const parsed = z
    .object({ title: z.string().trim().min(1).max(300).optional(), due_date: isoDate.nullable().optional(), done: z.boolean().optional() })
    .safeParse(patch);
  if (!uuid.safeParse(id).success || !parsed.success) return fail("Invalid change");
  const { done: isDone, ...rest } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_todos")
    .update({ ...rest, ...(isDone === undefined ? {} : { done_at: isDone ? new Date().toISOString() : null }) })
    .eq("id", id)
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("To-do not found");
  return done();
}

export async function deleteTodo(id: string): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid to-do");
  const supabase = await createClient();
  const { error } = await supabase.from("personal_todos").delete().eq("id", id);
  if (error) return fail(error.message);
  return done();
}

export async function clearDoneTodos(): Promise<Result> {
  await requireActiveProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("personal_todos").delete().not("done_at", "is", null);
  if (error) return fail(error.message);
  return done();
}

const noteSchema = z.object({
  title: z.string().trim().max(200).default(""),
  body: z.string().max(20000).default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  pinned: z.boolean().default(false),
});

export async function saveNote(id: string | null, input: unknown): Promise<Result<PersonalNote>> {
  const me = await requireActiveProfile();
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid note");
  if (id && !uuid.safeParse(id).success) return fail("Invalid note");
  const supabase = await createClient();
  const cols = "id, title, body, color, pinned, created_at, updated_at";
  const { data, error } = id
    ? await supabase.from("personal_notes").update(parsed.data).eq("id", id).select(cols).single()
    : await supabase.from("personal_notes").insert({ ...parsed.data, user_id: me.id }).select(cols).single();
  if (error) return fail(error.message);
  revalidatePath("/personal");
  return { ok: true, data: data as PersonalNote };
}

export async function deleteNote(id: string): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(id).success) return fail("Invalid note");
  const supabase = await createClient();
  const { error } = await supabase.from("personal_notes").delete().eq("id", id);
  if (error) return fail(error.message);
  return done();
}
