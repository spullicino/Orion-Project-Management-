"use client";

import { notFound } from "next/navigation";
import { MyTasksView } from "@/components/my-tasks/my-tasks-view";
import type { MyTask } from "@/types/board";
import type { GeneralTask } from "@/types/general-tasks";

/** Development-only preview of My Tasks with general tasks (no database). */
export default function GeneralTasksPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const me = { id: "me", role: "manager" as const };
  const g = (id: string, title: string, extra: Partial<GeneralTask>): GeneralTask => ({
    id, title, description: null, status: "not_started", priority: "medium", due_date: null, checklist: [], completed_at: null, created_at: "2026-11-24T09:00:00Z",
    created_by: "boss", creator_name: "Sarah Pullicino", client: null, assignees: [{ id: "me", first_name: "Mark", last_name: "Borg", email: null }], comment_count: 0, ...extra,
  });
  const general = [
    g("g1", "Chase ABC Ltd for an update on the tender", { client: { id: "c1", name: "ABC Ltd" }, due_date: "2026-11-27", status: "working", comment_count: 2, priority: "high" }),
    g("g2", "Renew van insurance", { due_date: "2026-11-20" }),
    g("g3", "Send revised quote to Central Bank", { created_by: "me", creator_name: "Mark Borg", assignees: [{ id: "j", first_name: "Joe", last_name: "Vella", email: null }], status: "waiting", client: { id: "c2", name: "Central Bank" } }),
  ];
  const project: MyTask[] = [
    { id: "t1", title: "Partition walls level 3", project_id: "p", group_id: "g", status_id: null, priority: "high", start_date: null, due_date: "2026-11-25", progress: 40, completed_at: null, project: { name: "OG5376 - Solair Apartments", color: "#2563eb" }, status: { name: "Working on it", color: "#f59e0b", is_done: false }, group: { name: "Fit-out" } },
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">My Tasks</h1>
      <MyTasksView
        projectTasks={project}
        general={general}
        me={me}
        canEditProjectTasks
        people={[{ id: "j", name: "Joe Vella", role: "technician" }, { id: "a", name: "Alexander Hamburger", role: "technician" }, { id: "me", name: "Mark Borg", role: "manager" }]}
        clients={[{ id: "c1", name: "ABC Ltd" }, { id: "c2", name: "Central Bank" }]}
        projects={[
          { id: "p1", name: "OG5376 - Solair Apartments", groups: [{ id: "g1", name: "Fit-out" }, { id: "g2", name: "Snagging" }], memberIds: ["j", "me"] },
          { id: "p2", name: "OG5698 - Central Bank", groups: [{ id: "g3", name: "General" }], memberIds: ["a"] },
        ]}
        openId={null}
      />
    </main>
  );
}
