import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/projects/project-form";
import { ColumnsCard, MembersCard, StatusesCard, TemplateAndDangerCard } from "@/components/projects/project-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getBoard, listActivePeople, listClients } from "@/lib/data/projects";

export const metadata: Metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const me = await requireRole("manager");
  const [board, clients, people] = await Promise.all([getBoard(projectId), listClients(), listActivePeople()]);
  if (!board) notFound();
  return (
    <div className="grid max-w-3xl gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm key={board.project.id} mode="edit" project={board.project} clients={clients} />
        </CardContent>
      </Card>
      <MembersCard
        board={board}
        people={people.map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email, avatar_src: p.avatar_src, role: p.role }))}
      />
      <StatusesCard board={board} />
      <ColumnsCard board={board} />
      <TemplateAndDangerCard board={board} isAdmin={hasRole(me.role, "admin")} />
    </div>
  );
}
