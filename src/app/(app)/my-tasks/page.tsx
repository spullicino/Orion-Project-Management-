import type { Metadata } from "next";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { MyTickets } from "@/components/aftersales/my-tickets";
import { MyTasksView } from "@/components/my-tasks/my-tasks-view";
import { can, hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { loadMyTickets } from "@/lib/data/aftersales";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";
import { getModuleLevel } from "@/lib/modules";
import { getMyTasks, listActivePeople, listClients, listProjects } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import type { GeneralTask } from "@/types/general-tasks";

export const metadata: Metadata = { title: "My Tasks" };
const nowMs = () => Date.now();

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ general?: string }> }) {
  const [me, { general: openId }] = await Promise.all([requireActiveProfile(), searchParams]);
  let tasks: Awaited<ReturnType<typeof getMyTasks>>;
  try {
    tasks = await getMyTasks();
  } catch (e) {
    if (!(e instanceof DatabaseUpdateNeeded)) throw e;
    return (
      <>
        <PageHeader title="My Tasks" />
        <DatabaseUpdateNotice isAdmin={me.role === "admin"} />
      </>
    );
  }
  const isManagerPlus = hasRole(me.role, "manager");
  const supabase = await createClient();
  const [generalRes, people, clients, projects, myTickets] = await Promise.all([
    supabase.rpc("get_general_tasks", { p_all: false }),
    isManagerPlus ? listActivePeople().catch(() => []) : Promise.resolve([]),
    isManagerPlus ? listClients().catch(() => []) : Promise.resolve([]),
    isManagerPlus ? listProjects().catch(() => []) : Promise.resolve([]),
    // Aftersales tickets assigned to me (only with the module).
    getModuleLevel(me, "aftersales").then((l) => (l ? loadMyTickets(supabase, me.id) : [])),
  ]);
  // Projects a manager can add tasks to from here: active ones, with their groups and people.
  const active = projects.filter((p) => p.status === "active" && !p.is_template);
  const ids = active.map((p) => p.id);
  const [{ data: groups }, { data: members }] = ids.length
    ? await Promise.all([
        supabase.from("groups").select("id, name, project_id, position").in("project_id", ids).order("position"),
        supabase.from("project_members").select("project_id, user_id").in("project_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const projectChoices = active.map((p) => ({
    id: p.id,
    name: p.name,
    groups: (groups ?? []).filter((g) => g.project_id === p.id).map((g) => ({ id: g.id, name: g.name })),
    memberIds: (members ?? []).filter((m) => m.project_id === p.id).map((m) => m.user_id),
  }));
  // Before database update 0026 there are no general tasks: show project tasks only.
  const general = generalRes.error ? null : ((generalRes.data ?? []) as unknown as GeneralTask[]);
  return (
    <>
      <PageHeader title="My Tasks" description={`Everything assigned to you — project tasks and general tasks${myTickets.length ? ", and your Aftersales tickets" : ""}.`} />
      <MyTickets tickets={myTickets} nowMs={nowMs()} className="mb-5" />
      <MyTasksView
        projectTasks={tasks}
        general={general}
        me={{ id: me.id, role: me.role }}
        canEditProjectTasks={can.editAssignedWork(me.role)}
        people={people.filter((p) => p.role !== "basic").map((p) => ({ id: p.id, name: fullName(p), role: p.role }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        projects={projectChoices}
        openId={openId && /^[0-9a-f-]{36}$/i.test(openId) ? openId : null}
      />
    </>
  );
}
