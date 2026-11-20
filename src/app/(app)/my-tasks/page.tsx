import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { MyTasksList } from "@/components/my-tasks/my-tasks-list";
import { can } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { getMyTasks } from "@/lib/data/projects";

export const metadata: Metadata = { title: "My Tasks" };

export default async function MyTasksPage() {
  const [me, tasks] = await Promise.all([requireActiveProfile(), getMyTasks()]);
  return (
    <>
      <PageHeader title="My Tasks" description="Everything assigned to you, across all projects." />
      <MyTasksList tasks={tasks} canEdit={can.editAssignedWork(me.role)} />
    </>
  );
}
