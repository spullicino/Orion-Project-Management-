import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/data/db-errors";
import type { MaterialListItem, ProjectMaterial } from "@/types/materials";

export async function getMaterialRequests(projectId: string | null): Promise<MaterialListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_material_requests", { p_project: projectId, p_open_only: false });
  if (error) throw dbError("Could not load material requests", error);
  return withDocCounts(supabase, (data ?? []) as unknown as MaterialListItem[]);
}

/** Adds how many delivery notes / invoices each request has (📎). Unchanged before database update 0029. */
export async function withDocCounts(supabase: Awaited<ReturnType<typeof createClient>>, list: MaterialListItem[]): Promise<MaterialListItem[]> {
  if (!list.length) return list;
  const { data, error } = await supabase
    .from("material_request_documents")
    .select("request_id")
    .in("request_id", list.map((r) => r.id));
  if (error || !data) return list;
  const counts = new Map<string, number>();
  for (const d of data) counts.set(d.request_id, (counts.get(d.request_id) ?? 0) + 1);
  return list.map((r) => ({ ...r, doc_count: counts.get(r.id) ?? 0 }));
}

export async function getProjectMaterials(projectId: string): Promise<ProjectMaterial[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_project_materials", { p_project: projectId });
  if (error) throw dbError("Could not load materials", error);
  return (data ?? []) as unknown as ProjectMaterial[];
}
