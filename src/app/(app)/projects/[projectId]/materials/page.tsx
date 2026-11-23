import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { MaterialsView } from "@/components/materials/materials-view";
import { hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";
import { getMaterialRequests } from "@/lib/data/materials";
import { getActiveProducts } from "@/lib/data/products";
import { getBoard } from "@/lib/data/projects";

export const metadata: Metadata = { title: "Materials" };

export default async function ProjectMaterialsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [me, board] = await Promise.all([requireActiveProfile(), getBoard(projectId).catch(() => null)]);
  if (!board) notFound();
  let data;
  try {
    data = await Promise.all([getMaterialRequests(projectId), getActiveProducts()]);
  } catch (e) {
    if (e instanceof DatabaseUpdateNeeded) return <DatabaseUpdateNotice isAdmin={me.role === "admin"} />;
    throw e;
  }
  // Seeing a project means a manager is on it (or created it); technicians must be on it to request.
  const isMember = board.members.some((m) => m.user_id === me.id);
  const canManage = hasRole(me.role, "manager");
  const canRequest = canManage || (me.role === "technician" && isMember);
  const project = { id: board.project.id, name: board.project.name };
  return (
    <MaterialsView
      meId={me.id}
      projectId={projectId}
      initial={data[0]}
      editable={canRequest ? [project] : []}
      manageable={canManage ? [projectId] : []}
      products={data[1]}
      projectName={board.project.name}
    />
  );
}
