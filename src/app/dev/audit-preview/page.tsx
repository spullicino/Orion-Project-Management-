"use client";

import { notFound } from "next/navigation";
import { AuditView } from "@/components/admin/audit-view";
import type { AuditEntry } from "@/lib/audit";

/** Development-only preview of Admin → Audit log (no database). */
export default function AuditPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const e = (id: number, at: string, actor: string, action: string, entity: string, title: string, changes: Record<string, unknown> = {}, project = "OG5376 - Solair Apartments"): AuditEntry => ({
    id, created_at: at, actor_id: "x", actor_name: actor, action, entity, entity_id: null, project_id: "p", project_name: project, title, changes,
  });
  const entries = [
    e(9, "2026-11-25T13:32:00Z", "Mark Borg", "deleted", "task", "Partition walls level 3"),
    e(8, "2026-11-25T12:10:00Z", "Joe Vella", "updated", "task", "Partition walls level 3", { status: ["Working on it", "Done"], progress: [60, 100] }),
    e(7, "2026-11-25T08:05:00Z", "Mark Borg", "assigned", "task", "Partition walls level 3", { person: "Joe Vella" }),
    e(6, "2026-11-24T16:40:00Z", "Sarah Pullicino", "updated", "user", "Joe Vella", { role: ["technician", "manager"] }, ""),
    e(5, "2026-11-24T15:00:00Z", "Mark Borg", "deleted", "group", "Snagging", { tasks_deleted: 3 }),
    e(4, "2026-11-24T09:12:00Z", "Mark Borg", "updated", "material_request", "Material request #12", { status: ["requested", "ordered"] }, "OG5698 - Central Bank"),
  ];
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Audit log</h1>
      <AuditView
        initial={entries}
        initialMore
        bin={[{ task_id: "t", project_id: "p", project_name: "OG5376 - Solair Apartments", title: "Partition walls level 3", deleted_at: "2026-11-25T13:32:00Z", deleted_by_name: "Mark Borg", group_name: "Fit-out", checklist: 3, comments: 2 }]}
        projects={[{ id: "p", name: "OG5376 - Solair Apartments" }]}
        people={[{ id: "x", name: "Mark Borg" }]}
      />
    </main>
  );
}
