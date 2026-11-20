import "server-only";
import { cache } from "react";
import { resolveAvatarUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { Board, Client, MyTask, ProjectSummary } from "@/types/board";
import type { Profile } from "@/types/database";

/** Full board for a project, or null if it doesn't exist / the user can't see it. */
export const getBoard = cache(async (projectId: string): Promise<Board | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_board", { p_project: projectId });
  if (error) throw new Error(`Could not load the project: ${error.message}`);
  if (!data) return null;
  const board = data as unknown as Board;
  const urls = await resolveAvatarUrls(supabase, board.members.map((m) => m.avatar_url));
  board.members = board.members.map((m, i) => ({ ...m, avatar_src: urls[i] }));
  return board;
});

export async function listProjects(opts: { archived?: boolean; templates?: boolean } = {}): Promise<ProjectSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_projects", {
    p_include_archived: opts.archived ?? false,
    p_templates: opts.templates ?? false,
  });
  if (error) throw new Error(`Could not load projects: ${error.message}`);
  return (data ?? []) as unknown as ProjectSummary[];
}

export async function getMyTasks(): Promise<MyTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_tasks");
  if (error) throw new Error(`Could not load your tasks: ${error.message}`);
  return (data ?? []) as unknown as MyTask[];
}

export async function listClients(): Promise<Client[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").order("name");
  return (data ?? []) as Client[];
}

/** Active people, for "add member" pickers (managers). Includes resolved avatar URLs. */
export async function listActivePeople(): Promise<(Profile & { avatar_src: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("status", "active").order("first_name");
  const people = data ?? [];
  const urls = await resolveAvatarUrls(supabase, people.map((p) => p.avatar_url));
  return people.map((p, i) => ({ ...p, avatar_src: urls[i] }));
}
