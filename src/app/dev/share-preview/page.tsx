import { notFound } from "next/navigation";
import { SharedProjectView, type Shared } from "@/components/gantt/shared-project-view";
import { previewBoard } from "@/dev/fixtures";

/** Development-only preview of the client share page with sample data. */
export default function SharePreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const b = previewBoard;
  const shared: Shared = {
    link: { label: null, expires_at: null, hide_owners: true },
    project: { ...b.project, client: { name: "Harbour Holdings Ltd", logo_path: null } },
    labels: b.labels,
    groups: b.groups,
    tasks: b.tasks.map((t) => ({ ...t, owners: [] })),
    milestones: b.milestones,
    generated_at: new Date().toISOString(),
  };
  return <SharedProjectView shared={shared} clientLogo={null} />;
}
