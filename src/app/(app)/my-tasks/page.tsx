import type { Metadata } from "next";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { MyTasksView } from "@/components/my-tasks/my-tasks-view";
import { can, hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";
import { getMyTasks, listActivePeople, listClients } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import type { GeneralTask } from "@/types/general-tasks";

export const metadata: Metadata = { title: "My Tasks" };

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
  const [generalRes, people, clients] = await Promise.all([
    supabase.rpc("get_general_tasks", { p_all: false }),
    isManagerPlus ? listActivePeople().catch(() => []) : Promise.resolve([]),
    isManagerPlus ? listClients().catch(() => []) : Promise.resolve([]),
  ]);
  // Before database update 0026 there are no general tasks: show project tasks only.
  const general = generalRes.error ? null : ((generalRes.data ?? []) as unknown as GeneralTask[]);
  return (
    <>
      <PageHeader title="My Tasks" description="Everything assigned to you — project tasks and general tasks." />
      <MyTasksView
        projectTasks={tasks}
        general={general}
        me={{ id: me.id, role: me.role }}
        canEditProjectTasks={can.editAssignedWork(me.role)}
        people={people.filter((p) => p.role !== "basic").map((p) => ({ id: p.id, name: fullName(p), role: p.role }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        openId={openId && /^[0-9a-f-]{36}$/i.test(openId) ? openId : null}
      />
    </>
  );
}
