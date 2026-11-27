"use server";

import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type SwitchProject = { id: string; name: string; color: string; code: string | null; status: string };

/** Projects this person can open (not templates or archived), for the "switch project" list. */
export async function listSwitchableProjects(): Promise<SwitchProject[]> {
  const me = await getCurrentProfile();
  if (!me || me.status !== "active") return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, color, code, status")
    .eq("is_template", false)
    .neq("status", "archived")
    .order("name")
    .limit(1000);
  return (data ?? []) as SwitchProject[];
}
