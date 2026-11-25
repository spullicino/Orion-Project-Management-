"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { AuditEntry } from "@/lib/audit";

const filtersSchema = z.object({
  search: z.string().trim().max(100).optional(),
  projectId: z.string().uuid().optional().or(z.literal("")),
  actorId: z.string().uuid().optional().or(z.literal("")),
  entity: z.string().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  before: z.number().int().positive().optional(),
});
export type AuditFilters = z.input<typeof filtersSchema>;

const PAGE = 100;

/** Midnight in Malta on a YYYY-MM-DD date (handles summer time). */
function maltaMidnight(day: string): Date {
  const utc = new Date(`${day}T00:00:00Z`);
  const tz = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Malta", timeZoneName: "shortOffset" }).formatToParts(utc).find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const hours = Number(tz.replace("GMT", "") || 0);
  return new Date(utc.getTime() - hours * 3_600_000);
}
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error: /does not exist|schema cache/.test(error) ? "Run database update 0028 first." : error });

/** Administrators: the newest audit entries matching the filters, 100 at a time. */
export async function loadAuditLog(input: AuditFilters): Promise<Result<{ entries: AuditEntry[]; more: boolean }>> {
  await requireRole("admin");
  const parsed = filtersSchema.safeParse(input);
  if (!parsed.success) return fail("Please check the filters");
  const f = parsed.data;
  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(PAGE + 1);
  if (f.before) q = q.lt("id", f.before);
  if (f.projectId) q = q.eq("project_id", f.projectId);
  if (f.actorId) q = q.eq("actor_id", f.actorId);
  if (f.entity) q = q.eq("entity", f.entity);
  if (f.from) q = q.gte("created_at", maltaMidnight(f.from).toISOString());
  if (f.to) q = q.lt("created_at", new Date(maltaMidnight(f.to).getTime() + 86_400_000).toISOString());
  if (f.search) {
    const s = f.search.replace(/[%_,()]/g, " ");
    q = q.or(`title.ilike.%${s}%,project_name.ilike.%${s}%,actor_name.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as AuditEntry[];
  return { ok: true, data: { entries: rows.slice(0, PAGE), more: rows.length > PAGE } };
}

export type BinItem = { task_id: string; project_id: string; project_name: string | null; title: string; deleted_at: string; deleted_by_name: string | null; group_name: string | null; checklist: number; comments: number };

/** Administrators: tasks deleted in the last 30 days that haven't been put back. */
export async function loadRecycleBin(): Promise<Result<BinItem[]>> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deleted_tasks")
    .select("task_id, project_id, project_name, title, deleted_at, deleted_by_name, snapshot")
    .is("restored_at", null)
    .gte("deleted_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order("deleted_at", { ascending: false })
    .limit(300);
  if (error) return fail(error.message);
  return {
    ok: true,
    data: (data ?? []).map((d) => {
      const s = (d.snapshot ?? {}) as { group_name?: string; checklist?: unknown[]; comments?: unknown[] };
      return {
        task_id: d.task_id,
        project_id: d.project_id,
        project_name: d.project_name,
        title: d.title,
        deleted_at: d.deleted_at,
        deleted_by_name: d.deleted_by_name,
        group_name: s.group_name ?? null,
        checklist: s.checklist?.length ?? 0,
        comments: s.comments?.length ?? 0,
      };
    }),
  };
}

/** Administrators: put a deleted task back. */
export async function restoreTask(taskId: string): Promise<Result<{ projectId: string }>> {
  await requireRole("admin");
  if (!z.string().uuid().safeParse(taskId).success) return fail("Invalid task");
  const supabase = await createClient();
  const { data: row } = await supabase.from("deleted_tasks").select("project_id").eq("task_id", taskId).maybeSingle();
  const { error } = await supabase.rpc("restore_task", { p_task: taskId });
  if (error) return fail(error.message);
  if (row) revalidatePath(`/projects/${row.project_id}`, "layout");
  revalidatePath("/admin/audit");
  return { ok: true, data: { projectId: row?.project_id ?? "" } };
}
