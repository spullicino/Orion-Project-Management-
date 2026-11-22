import type { Metadata } from "next";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { MaterialsView } from "@/components/materials/materials-view";
import { hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";
import { getPostableProjects } from "@/lib/data/diary";
import { getMaterialRequests } from "@/lib/data/materials";
import { listProjects } from "@/lib/data/projects";

export const metadata: Metadata = { title: "Material requests" };

/** Material requests across every project you're on. */
export default async function MaterialsPage() {
  const me = await requireActiveProfile();
  let list;
  try {
    list = await getMaterialRequests(null);
  } catch (e) {
    if (e instanceof DatabaseUpdateNeeded) {
      return (
        <>
          <PageHeader title="Material requests" />
          <DatabaseUpdateNotice isAdmin={me.role === "admin"} />
        </>
      );
    }
    throw e;
  }
  const canManage = hasRole(me.role, "manager");
  const [postable, visible] = await Promise.all([
    hasRole(me.role, "technician") ? getPostableProjects().catch(() => []) : Promise.resolve([]),
    canManage ? listProjects().catch(() => []) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Material requests" description={canManage ? "Requests from site on your projects — newest needs first." : "Materials you and your team have asked for."} />
      <MaterialsView
        meId={me.id}
        initial={list}
        editable={postable.map((p) => ({ id: p.id, name: p.name }))}
        manageable={visible.map((p) => p.id)}
      />
    </>
  );
}
