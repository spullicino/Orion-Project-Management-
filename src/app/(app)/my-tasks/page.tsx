import type { Metadata } from "next";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { MyTasksList } from "@/components/my-tasks/my-tasks-list";
import { can } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";
import { getMyTasks } from "@/lib/data/projects";

export const metadata: Metadata = { title: "My Tasks" };

export default async function MyTasksPage() {
  const me = await requireActiveProfile();
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
  return (
    <>
      <PageHeader title="My Tasks" description="Everything assigned to you, across all projects." />
      <MyTasksList tasks={tasks} canEdit={can.editAssignedWork(me.role)} />
    </>
  );
}
