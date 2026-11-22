import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/data/db-errors";
import type { MaterialListItem, ProjectMaterial } from "@/types/materials";

export async function getMaterialRequests(projectId: string | null): Promise<MaterialListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_material_requests", { p_project: projectId, p_open_only: false });
  if (error) throw dbError("Could not load material requests", error);
  return (data ?? []) as unknown as MaterialListItem[];
}

export async function getProjectMaterials(projectId: string): Promise<ProjectMaterial[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_materials", { p_project: projectId });
  if (error) throw dbError("Could not load materials", error);
  return (data ?? []) as unknown as ProjectMaterial[];
}
