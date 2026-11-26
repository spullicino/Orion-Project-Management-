"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasRole } from "@/lib/auth/roles";
import { requireActiveProfile, requireRole } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { queuePush } from "@/lib/notify/queue";
import { createClient } from "@/lib/supabase/server";
import {
  copyTaskSchema,
  ATTACHMENT_MAX_BYTES,
  checklistItemSchema,
  clientSchema,
  commentSchema,
  createProjectSchema,
  customColumnSchema,
  groupSchema,
  hiddenColumnsSchema,
  labelSchema,
  newTaskSchema,
  projectSchema,
  taskPatchSchema,
} from "@/lib/validation/projects";
import type { TaskDetail } from "@/types/board";

export type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

const uuid = z.string().uuid();
const fail = (error: string): Result<never> => ({ ok: false, error });
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Please check the form";

/** Turns database errors into plain language. */
function friendly(message: string) {
  if (/row-level security|permission denied/i.test(message)) return "You don't have permission to do that.";
  if (/duplicate key/i.test(message)) return "That already exists.";
  if (/violates foreign key/i.test(message)) return "Something this refers to no longer exists. Refresh and try again.";
  if (/due_date.*start_date|end_date.*start_date|check constraint/i.test(message)) return "Please check the dates: the end can't be before the start.";
  return message;
}

function refreshProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/my-tasks");
}

async function taskProjectId(supabase: Awaited<ReturnType<typeof createClient>>, taskId: string) {
  const { data } = await supabase.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  return data?.project_id ?? null;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

async function resolveClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string | null | undefined,
  newClientName: string | null | undefined,
  userId: string,
) {
  if (newClientName) {
    const { data, error } = await supabase.from("clients").insert({ name: newClientName, created_by: userId }).select("id").single();
    if (error) throw new Error(friendly(error.message));
    return data.id;
  }
  return clientId ?? null;
}

export async function createProject(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireRole("manager");
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();

  try {
    const clientId = await resolveClientId(supabase, v.client_id, v.new_client_name, me.id);
    let projectId: string;

    if (v.source_id) {
      const { data, error } = await supabase.rpc("duplicate_project", {
        p_source: v.source_id,
        p_name: v.name,
        p_as_template: false,
        p_start_date: v.start_date ?? null,
        p_client_id: clientId,
      });
      if (error) return fail(friendly(error.message));
      projectId = data as string;
      await supabase
        .from("projects")
        .update({ code: v.code, color: v.color, description: v.description, end_date: v.end_date ?? undefined })
        .eq("id", projectId);
    } else {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: v.name,
          code: v.code,
          description: v.description,
          client_id: clientId,
          start_date: v.start_date ?? null,
          end_date: v.end_date ?? null,
          color: v.color,
          created_by: me.id,
        })
        .select("id")
        .single();
      if (error) return fail(friendly(error.message));
      projectId = data.id;
      await supabase.from("groups").insert([
        { project_id: projectId, name: "Planning", color: "#6366f1", position: 1 },
        { project_id: projectId, name: "In progress", color: "#f59e0b", position: 2 },
        { project_id: projectId, name: "Done", color: "#22c55e", position: 3 },
      ]);
    }

    const members = [...new Set(v.member_ids)].filter((id) => id !== me.id);
    if (members.length) {
      await supabase
        .from("project_members")
        .upsert(members.map((user_id) => ({ project_id: projectId, user_id, added_by: me.id })), { ignoreDuplicates: true });
    }
    revalidatePath("/projects");
    return { ok: true, data: { id: projectId } };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function updateProject(projectId: string, input: unknown): Promise<Result> {
  const me = await requireRole("manager");
  if (!uuid.safeParse(projectId).success) return fail("Invalid project");
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  try {
    const clientId = await resolveClientId(supabase, v.client_id, v.new_client_name, me.id);
    const { error } = await supabase
      .from("projects")
      .update({
        name: v.name,
        code: v.code,
        description: v.description,
        client_id: clientId,
        start_date: v.start_date ?? null,
        end_date: v.end_date ?? null,
        color: v.color,
        status: v.status,
      })
      .eq("id", projectId);
    if (error) return fail(friendly(error.message));
  } catch (e) {
    return fail((e as Error).message);
  }
  refreshProject(projectId);
  return { ok: true, message: "Project saved" };
}

export async function setHiddenColumns(projectId: string, columns: unknown): Promise<Result> {
  await requireRole("manager");
  const parsed = hiddenColumnsSchema.safeParse(columns);
  if (!uuid.safeParse(projectId).success || !parsed.success) return fail("Invalid request");
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ hidden_columns: parsed.data }).eq("id", projectId);
  if (error) return fail(friendly(error.message));
  refreshProject(projectId);
  return { ok: true };
}

export async function saveAsTemplate(projectId: string, name: string): Promise<Result<{ id: string }>> {
  await requireRole("manager");
  const n = z.string().trim().min(1, "Give the template a name").max(160).safeParse(name);
  if (!uuid.safeParse(projectId).success) return fail("Invalid project");
  if (!n.success) return fail(firstIssue(n.error));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_project", { p_source: projectId, p_name: n.data, p_as_template: true });
  if (error) return fail(friendly(error.message));
  revalidatePath("/projects");
  return { ok: true, data: { id: data as string }, message: "Template saved" };
}

export async function deleteProject(projectId: string): Promise<Result> {
  await requireRole("admin");
  if (!uuid.safeParse(projectId).success) return fail("Invalid project");
  const supabase = await createClient();
  const { error, count } = await supabase.from("projects").delete({ count: "exact" }).eq("id", projectId);
  if (error) return fail(friendly(error.message));
  if (!count) return fail("You don't have permission to do that.");
  revalidatePath("/projects");
  return { ok: true, message: "Project deleted" };
}

export async function addMembers(projectId: string, userIds: string[]): Promise<Result> {
  const me = await requireRole("manager");
  const ids = z.array(uuid).min(1).max(200).safeParse(userIds);
  if (!uuid.safeParse(projectId).success || !ids.success) return fail("Choose at least one person");
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .upsert(ids.data.map((user_id) => ({ project_id: projectId, user_id, added_by: me.id })), { ignoreDuplicates: true });
  if (error) return fail(friendly(error.message));
  refreshProject(projectId);
  return { ok: true, message: ids.data.length === 1 ? "Person added" : "People added" };
}

export async function removeMember(projectId: string, userId: string): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(userId).success) return fail("Invalid request");
  const supabase = await createClient();
  const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
  if (error) return fail(friendly(error.message));
  refreshProject(projectId);
  return { ok: true, message: "Removed from project" };
}

// ---------------------------------------------------------------------------
// Status labels & custom columns (managers)
// ---------------------------------------------------------------------------

export async function saveLabel(projectId: string, labelId: string | null, input: unknown): Promise<Result> {
  await requireRole("manager");
  const parsed = labelSchema.safeParse(input);
  if (!uuid.safeParse(projectId).success) return fail("Invalid project");
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  if (labelId) {
    const { error } = await supabase.from("status_labels").update(parsed.data).eq("id", labelId).eq("project_id", projectId);
    if (error) return fail(friendly(error.message));
  } else {
    const { data: last } = await supabase
      .from("status_labels")
      .select("position")
      .eq("project_id", projectId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from("status_labels")
      .insert({ ...parsed.data, project_id: projectId, position: (last?.position ?? -1) + 1 });
    if (error) return fail(friendly(error.message));
  }
  refreshProject(projectId);
  return { ok: true };
}

export async function deleteLabel(projectId: string, labelId: string): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(labelId).success) return fail("Invalid request");
  const supabase = await createClient();
  const { count } = await supabase.from("status_labels").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if ((count ?? 0) <= 1) return fail("A project needs at least one status.");
  const { error } = await supabase.from("status_labels").delete().eq("id", labelId).eq("project_id", projectId);
  if (error) return fail(friendly(error.message));
  refreshProject(projectId);
  return { ok: true, message: "Status removed. Tasks that used it now have no status." };
}

export async function addCustomColumn(input: unknown): Promise<Result> {
  await requireRole("manager");
  const parsed = customColumnSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { count } = await supabase
    .from("project_columns")
    .select("id", { count: "exact", head: true })
    .eq("project_id", parsed.data.project_id);
  const { error } = await supabase.from("project_columns").insert({ ...parsed.data, position: count ?? 0 });
  if (error) return fail(friendly(error.message));
  refreshProject(parsed.data.project_id);
  return { ok: true, message: "Column added" };
}

export async function deleteCustomColumn(projectId: string, columnId: string): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(columnId).success) return fail("Invalid request");
  const supabase = await createClient();
  const { error } = await supabase.from("project_columns").delete().eq("id", columnId).eq("project_id", projectId);
  if (error) return fail(friendly(error.message));
  refreshProject(projectId);
  return { ok: true, message: "Column removed" };
}

// ---------------------------------------------------------------------------
// Groups (managers)
// ---------------------------------------------------------------------------

export async function createGroup(input: unknown): Promise<Result> {
  await requireRole("manager");
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("groups")
    .select("position")
    .eq("project_id", parsed.data.project_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("groups").insert({
    project_id: parsed.data.project_id,
    name: parsed.data.name,
    color: parsed.data.color ?? "#64748b",
    position: (last?.position ?? 0) + 1,
  });
  if (error) return fail(friendly(error.message));
  refreshProject(parsed.data.project_id);
  return { ok: true };
}

export async function updateGroup(groupId: string, input: { name?: string; color?: string; collapsed?: boolean; position?: number }): Promise<Result> {
  await requireRole("manager");
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      collapsed: z.boolean().optional(),
      position: z.number().finite().optional(),
    })
    .safeParse(input);
  if (!uuid.safeParse(groupId).success || !parsed.success) return fail("Invalid request");
  const supabase = await createClient();
  const { data, error } = await supabase.from("groups").update(parsed.data).eq("id", groupId).select("project_id").single();
  if (error) return fail(friendly(error.message));
  refreshProject(data.project_id);
  return { ok: true };
}

export async function deleteGroup(groupId: string): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(groupId).success) return fail("Invalid request");
  const supabase = await createClient();
  const { data, error } = await supabase.from("groups").delete().eq("id", groupId).select("project_id").single();
  if (error) return fail(friendly(error.message));
  refreshProject(data.project_id);
  return { ok: true, message: "Group and its tasks deleted" };
}

// ---------------------------------------------------------------------------
// Tasks (technicians on their projects, managers everywhere — enforced by RLS)
// ---------------------------------------------------------------------------

export async function createTask(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireActiveProfile();
  if (!hasRole(me.role, "technician")) return fail("You don't have permission to do that.");
  const parsed = newTaskSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const [{ data: last }, { data: firstLabel }] = await Promise.all([
    supabase
      .from("tasks")
      .select("position")
      .eq("group_id", parsed.data.group_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("status_labels")
      .select("id")
      .eq("project_id", parsed.data.project_id)
      .order("position")
      .limit(1)
      .maybeSingle(),
  ]);
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...parsed.data, created_by: me.id, position: (last?.position ?? 0) + 1, status_id: firstLabel?.id ?? null })
    .select("id")
    .single();
  if (error) return fail(friendly(error.message));
  refreshProject(parsed.data.project_id);
  return { ok: true, data: { id: data.id } };
}

export async function updateTask(taskId: string, patch: unknown): Promise<Result> {
  const me = await requireActiveProfile();
  if (!hasRole(me.role, "technician")) return fail("You don't have permission to do that.");
  if (!uuid.safeParse(taskId).success) return fail("Invalid task");
  const parsed = taskPatchSchema.safeParse(patch);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();

  const values = { ...parsed.data };
  if (values.custom_values) {
    // Merge with existing values so two people editing different columns don't overwrite each other.
    const { data: current } = await supabase.from("tasks").select("custom_values").eq("id", taskId).maybeSingle();
    values.custom_values = { ...((current?.custom_values as Record<string, string | number | null>) ?? {}), ...values.custom_values };
  }
  const { data, error } = await supabase.from("tasks").update(values).eq("id", taskId).select("project_id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("You don't have permission to change this task.");
  refreshProject(data[0].project_id);
  if (values.status_id !== undefined) queuePush();
  return { ok: true };
}

export async function markTaskDone(taskId: string, done: boolean): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(taskId).success) return fail("Invalid task");
  const supabase = await createClient();
  const projectId = await taskProjectId(supabase, taskId);
  if (!projectId) return fail("Task not found");
  const { data: label } = await supabase
    .from("status_labels")
    .select("id")
    .eq("project_id", projectId)
    .eq("is_done", done)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (!label) return fail(done ? "This project has no “done” status." : "This project has no open status.");
  return updateTask(taskId, done ? { status_id: label.id } : { status_id: label.id, progress: 0 });
}

export async function deleteTask(taskId: string): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(taskId).success) return fail("Invalid task");
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", taskId).select("project_id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("You don't have permission to delete this task.");
  refreshProject(data[0].project_id);
  return { ok: true, message: "Task deleted" };
}

export async function setTaskAssignee(taskId: string, userId: string, assigned: boolean): Promise<Result> {
  const me = await requireActiveProfile();
  if (!uuid.safeParse(taskId).success || !uuid.safeParse(userId).success) return fail("Invalid request");
  if (!hasRole(me.role, "manager") && userId !== me.id) return fail("Only managers can assign other people.");
  const supabase = await createClient();
  const { error } = assigned
    ? await supabase.from("task_assignees").upsert({ task_id: taskId, user_id: userId, assigned_by: me.id }, { ignoreDuplicates: true })
    : await supabase.from("task_assignees").delete().eq("task_id", taskId).eq("user_id", userId);
  if (error) return fail(friendly(error.message));
  const projectId = await taskProjectId(supabase, taskId);
  if (projectId) refreshProject(projectId);
  if (assigned) queuePush();
  return { ok: true };
}

export async function setDependency(taskId: string, dependsOnId: string, add: boolean): Promise<Result> {
  await requireRole("manager");
  if (!uuid.safeParse(taskId).success || !uuid.safeParse(dependsOnId).success) return fail("Invalid request");
  if (taskId === dependsOnId) return fail("A task can't depend on itself.");
  const supabase = await createClient();
  if (add) {
    // Refuse simple loops (A waits for B while B waits for A).
    const { data: reverse } = await supabase
      .from("task_dependencies")
      .select("task_id")
      .eq("task_id", dependsOnId)
      .eq("depends_on_task_id", taskId)
      .maybeSingle();
    if (reverse) return fail("That would make the two tasks wait for each other.");
  }
  const { error } = add
    ? await supabase.from("task_dependencies").upsert({ task_id: taskId, depends_on_task_id: dependsOnId }, { ignoreDuplicates: true })
    : await supabase.from("task_dependencies").delete().eq("task_id", taskId).eq("depends_on_task_id", dependsOnId);
  if (error) return fail(friendly(error.message));
  const projectId = await taskProjectId(supabase, taskId);
  if (projectId) refreshProject(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Task drawer: details, checklist, comments, attachments
// ---------------------------------------------------------------------------

export async function getTaskDetail(taskId: string): Promise<Result<TaskDetail>> {
  await requireActiveProfile();
  if (!uuid.safeParse(taskId).success) return fail("Invalid task");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_task_detail", { p_task: taskId });
  if (error) return fail(friendly(error.message));
  if (!data) return fail("This task doesn't exist or you don't have access to it.");
  return { ok: true, data: data as unknown as TaskDetail };
}

export async function addChecklistItem(input: unknown): Promise<Result> {
  await requireActiveProfile();
  const parsed = checklistItemSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.from("task_checklist_items").insert({ ...parsed.data, position: Date.now() / 1000 });
  if (error) return fail(friendly(error.message));
  const projectId = await taskProjectId(supabase, parsed.data.task_id);
  if (projectId) refreshProject(projectId);
  return { ok: true };
}

export async function updateChecklistItem(itemId: string, patch: { is_done?: boolean; title?: string }): Promise<Result> {
  await requireActiveProfile();
  const parsed = z.object({ is_done: z.boolean().optional(), title: z.string().trim().min(1).max(300).optional() }).safeParse(patch);
  if (!uuid.safeParse(itemId).success || !parsed.success) return fail("Invalid request");
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_checklist_items").update(parsed.data).eq("id", itemId).select("task_id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("You don't have permission to change this.");
  const projectId = await taskProjectId(supabase, data[0].task_id);
  if (projectId) refreshProject(projectId);
  return { ok: true };
}

export async function deleteChecklistItem(itemId: string): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(itemId).success) return fail("Invalid request");
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_checklist_items").delete().eq("id", itemId).select("task_id");
  if (error) return fail(friendly(error.message));
  if (data?.[0]) {
    const projectId = await taskProjectId(supabase, data[0].task_id);
    if (projectId) refreshProject(projectId);
  }
  return { ok: true };
}

export async function addComment(input: unknown): Promise<Result> {
  const me = await requireActiveProfile();
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({ ...parsed.data, author_id: me.id });
  if (error) return fail(friendly(error.message));
  queuePush();
  const projectId = await taskProjectId(supabase, parsed.data.task_id);
  if (projectId) refreshProject(projectId);
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(commentId).success) return fail("Invalid request");
  const supabase = await createClient();
  const { data, error } = await supabase.from("comments").delete().eq("id", commentId).select("task_id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("You can only delete your own comments.");
  return { ok: true };
}

const safeFileName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(-120) || "file";

export async function createAttachmentUpload(input: { taskId: string; fileName: string; size: number; contentType: string }): Promise<Result<{ path: string; token: string }>> {
  const me = await requireActiveProfile();
  if (!uuid.safeParse(input.taskId).success) return fail("Invalid task");
  if (!(input.size > 0) || input.size > ATTACHMENT_MAX_BYTES) return fail("Files can be up to 25 MB.");
  if (!(await rateLimit("upload", me.id))) return fail("Too many uploads. Please wait a few minutes.");
  const supabase = await createClient();
  const projectId = await taskProjectId(supabase, input.taskId);
  if (!projectId) return fail("Task not found");
  const path = `${projectId}/tasks/${input.taskId}/${crypto.randomUUID()}-${safeFileName(input.fileName)}`;
  const { data, error } = await supabase.storage.from("project-files").createSignedUploadUrl(path);
  if (error || !data) return fail("You can't upload files to this project.");
  return { ok: true, data: { path: data.path, token: data.token } };
}

export async function saveAttachment(input: { taskId: string; path: string; fileName: string; size: number; contentType: string }): Promise<Result> {
  const me = await requireActiveProfile();
  if (!uuid.safeParse(input.taskId).success) return fail("Invalid task");
  const supabase = await createClient();
  const projectId = await taskProjectId(supabase, input.taskId);
  if (!projectId || !input.path.startsWith(`${projectId}/tasks/${input.taskId}/`)) return fail("Invalid file");
  const { error } = await supabase.from("attachments").insert({
    task_id: input.taskId,
    storage_path: input.path,
    file_name: input.fileName.slice(0, 255),
    mime_type: input.contentType.slice(0, 120) || null,
    size_bytes: input.size,
    uploaded_by: me.id,
  });
  if (error) return fail(friendly(error.message));
  refreshProject(projectId);
  return { ok: true };
}

export async function getAttachmentUrl(attachmentId: string): Promise<Result<{ url: string }>> {
  await requireActiveProfile();
  if (!uuid.safeParse(attachmentId).success) return fail("Invalid file");
  const supabase = await createClient();
  const { data: att } = await supabase.from("attachments").select("storage_path, file_name").eq("id", attachmentId).maybeSingle();
  if (!att) return fail("File not found");
  const { data, error } = await supabase.storage
    .from("project-files")
    .createSignedUrl(att.storage_path, 60 * 10, { download: att.file_name });
  if (error || !data) return fail("Couldn't open the file.");
  return { ok: true, data: { url: data.signedUrl } };
}

export async function deleteAttachment(attachmentId: string): Promise<Result> {
  await requireActiveProfile();
  if (!uuid.safeParse(attachmentId).success) return fail("Invalid file");
  const supabase = await createClient();
  const { data, error } = await supabase.from("attachments").delete().eq("id", attachmentId).select("storage_path, task_id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("You can only delete files you uploaded.");
  await supabase.storage.from("project-files").remove([data[0].storage_path]);
  const projectId = await taskProjectId(supabase, data[0].task_id);
  if (projectId) refreshProject(projectId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Clients (managers)
// ---------------------------------------------------------------------------

export async function saveClient(clientId: string | null, input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireRole("manager");
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { data, error } = clientId
    ? await supabase.from("clients").update(parsed.data).eq("id", clientId).select("id").single()
    : await supabase.from("clients").insert({ ...parsed.data, created_by: me.id }).select("id").single();
  if (error) return fail(friendly(error.message));
  revalidatePath("/clients");
  return { ok: true, data: { id: data.id }, message: "Client saved" };
}

export async function deleteClient(clientId: string): Promise<Result> {
  await requireRole("admin");
  if (!uuid.safeParse(clientId).success) return fail("Invalid request");
  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) return fail(friendly(error.message));
  revalidatePath("/clients");
  return { ok: true, message: "Client deleted" };
}

export type CopyTarget = { id: string; name: string; color: string; groups: { id: string; name: string }[] };

/** Projects the current user can add tasks to (for "Copy to other projects"), with their groups. */
export async function loadCopyTargets(excludeProjectId: string): Promise<Result<CopyTarget[]>> {
  const me = await requireActiveProfile();
  if (!hasRole(me.role, "technician")) return { ok: true, data: [] };
  const supabase = await createClient();
  const [{ data: projects, error }, { data: memberships }] = await Promise.all([
    supabase.from("projects").select("id, name, color, status").eq("is_template", false).neq("status", "archived").order("name"),
    supabase.from("project_members").select("project_id").eq("user_id", me.id),
  ]);
  if (error) return fail(friendly(error.message));
  const mine = new Set((memberships ?? []).map((m) => m.project_id));
  // Managers and admins can add tasks to every project they can see; technicians only to projects they're on.
  const editable = (projects ?? []).filter((p) => p.id !== excludeProjectId && (hasRole(me.role, "manager") || mine.has(p.id)));
  if (!editable.length) return { ok: true, data: [] };
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, project_id, position")
    .in("project_id", editable.map((p) => p.id))
    .order("position");
  return {
    ok: true,
    data: editable.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      groups: (groups ?? []).filter((g) => g.project_id === p.id).map((g) => ({ id: g.id, name: g.name })),
    })),
  };
}

/** Copies a task into other projects (see migration 0018 for what is and isn't copied). */
export async function copyTask(taskId: string, input: unknown): Promise<Result<{ project_id: string; task_id: string }[]>> {
  const me = await requireActiveProfile();
  if (!hasRole(me.role, "technician")) return fail("You don't have permission to do that.");
  if (!uuid.safeParse(taskId).success) return fail("Invalid task");
  const parsed = copyTaskSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_task_to_projects", { p_task: taskId, p_targets: parsed.data.targets });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message)) return fail("Copying tasks needs the latest database update (ask your administrator).");
    return fail(friendly(error.message));
  }
  const copied = (data ?? []) as { project_id: string; task_id: string }[];
  for (const c of copied) refreshProject(c.project_id);
  queuePush(); // owners on the other projects are told they have a task
  return { ok: true, data: copied };
}

const needsUpdate = (m: string) => /function .* does not exist|schema cache/i.test(m);

/** Moves a task within (or into) a group: before another task, or to the end. */
export async function moveTask(taskId: string, groupId: string, beforeId: string | null): Promise<Result> {
  await requireActiveProfile();
  if (![taskId, groupId].every((x) => uuid.safeParse(x).success) || (beforeId && !uuid.safeParse(beforeId).success)) return fail("Invalid task");
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_task", { p_task: taskId, p_group: groupId, p_before: beforeId });
  if (error) return fail(needsUpdate(error.message) ? "Reordering tasks needs the latest database update (ask your administrator)." : friendly(error.message));
  const projectId = await taskProjectId(supabase, taskId);
  if (projectId) refreshProject(projectId);
  return { ok: true };
}

const insertSchema = z.object({
  where: z.enum(["above", "below"]),
  title: z.string().trim().min(1, "Give the task a name").max(300),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  rewire: z.boolean().default(true),
}).refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, { message: "The due date can't be before the start date." });

/** Adds a task right above or below another one (and keeps linked tasks in a chain). */
export async function insertTaskAt(anchorId: string, input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireActiveProfile();
  if (!hasRole(me.role, "technician")) return fail("You don't have permission to do that.");
  if (!uuid.safeParse(anchorId).success) return fail("Invalid task");
  const parsed = insertSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("insert_task_at", {
    p_anchor: anchorId,
    p_where: v.where,
    p_title: v.title,
    p_start: v.start_date ?? null,
    p_due: v.due_date ?? null,
    p_rewire: v.rewire,
  });
  if (error) return fail(needsUpdate(error.message) ? "Inserting tasks needs the latest database update (ask your administrator)." : friendly(error.message));
  const projectId = await taskProjectId(supabase, anchorId);
  if (projectId) refreshProject(projectId);
  return { ok: true, data: { id: data as unknown as string } };
}

/**
 * Moves a group up/down one place, to the top/bottom, or (dragging) just before another
 * group — `{ before: id }`, or `{ before: null }` for the end.
 */
export async function moveGroup(groupId: string, to: "up" | "down" | "top" | "bottom" | { before: string | null }): Promise<Result> {
  await requireRole("manager");
  const valid = typeof to === "object" ? to.before === null || uuid.safeParse(to.before).success : ["up", "down", "top", "bottom"].includes(to);
  if (!uuid.safeParse(groupId).success || !valid) return fail("Invalid request");
  const supabase = await createClient();
  const { data: g } = await supabase.from("groups").select("project_id").eq("id", groupId).maybeSingle();
  if (!g) return fail("Group not found");
  const { data: all, error } = await supabase.from("groups").select("id, position, created_at").eq("project_id", g.project_id).order("position").order("created_at");
  if (error) return fail(friendly(error.message));
  const ids = (all ?? []).map((x) => x.id);
  const from = ids.indexOf(groupId);
  if (from === -1) return fail("Group not found");
  ids.splice(from, 1);
  let target: number;
  if (typeof to === "object") {
    const at = to.before ? ids.indexOf(to.before) : -1;
    target = at === -1 ? ids.length : at;
  } else target = to === "top" ? 0 : to === "bottom" ? ids.length : to === "up" ? Math.max(0, from - 1) : Math.min(ids.length, from + 1);
  if (target === from) return { ok: true };
  ids.splice(target, 0, groupId);
  // Number them 1, 2, 3… and save only the ones whose place changed.
  for (const [i, id] of ids.entries()) {
    const before = all!.find((x) => x.id === id)!;
    if (Number(before.position) === i + 1) continue;
    const { data: updated, error: upErr } = await supabase.from("groups").update({ position: i + 1 }).eq("id", id).select("id");
    if (upErr) return fail(friendly(upErr.message));
    if (!updated?.length) return fail("You can't change the groups on this project.");
  }
  refreshProject(g.project_id);
  return { ok: true };
}

const duplicateSchema = z.object({ group_id: uuid, keep_dates: z.boolean().default(true) });

/**
 * Duplicate a task in the same project: same details, checklist (unticked), people,
 * priority, internal and repeat settings; status and progress start fresh; comments and
 * files aren't copied. Placed right below the original (or at the end of another group).
 */
export async function duplicateTask(taskId: string, input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireActiveProfile();
  if (!hasRole(me.role, "technician")) return fail("You don't have permission to do that.");
  if (!uuid.safeParse(taskId).success) return fail("Invalid task");
  const parsed = duplicateSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const supabase = await createClient();
  const { data: src } = await supabase.from("tasks").select("id, project_id, group_id, title, position").eq("id", taskId).maybeSingle();
  if (!src) return fail("Task not found");
  const { data, error } = await supabase.rpc("copy_task_to_projects", {
    p_task: taskId,
    p_targets: [{ project_id: src.project_id, group_id: parsed.data.group_id }],
  });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message)) return fail("Duplicating tasks needs the latest database update (ask your administrator).");
    return fail(friendly(error.message));
  }
  const newId = ((data ?? []) as { task_id: string }[])[0]?.task_id;
  if (!newId) return fail("Couldn't duplicate the task");

  const title = `${src.title} (copy)`.slice(0, 300);
  await supabase
    .from("tasks")
    .update(parsed.data.keep_dates ? { title } : { title, start_date: null, due_date: null, repeat_rule: null, repeat_until: null })
    .eq("id", newId);

  // Same group: put the copy straight below the original.
  if (parsed.data.group_id === src.group_id) {
    const { data: next } = await supabase
      .from("tasks")
      .select("id")
      .eq("group_id", src.group_id)
      .gt("position", src.position)
      .neq("id", newId)
      .order("position")
      .limit(1)
      .maybeSingle();
    await supabase.rpc("move_task", { p_task: newId, p_group: src.group_id, p_before: next?.id ?? null });
  }
  refreshProject(src.project_id);
  queuePush();
  return { ok: true, data: { id: newId } };
}
