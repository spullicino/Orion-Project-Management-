import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { listActivePeople, listClients, listProjects } from "@/lib/data/projects";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const me = await requireRole("manager");
  const [clients, people, templates, projects] = await Promise.all([
    listClients(),
    listActivePeople(),
    listProjects({ templates: true }),
    listProjects({ archived: true }),
  ]);
  const sources = [...templates, ...projects].map((p) => ({ id: p.id, name: p.name, is_template: p.is_template }));
  return (
    <>
      <PageHeader title="New project" />
      <Card className="max-w-3xl">
        <CardContent className="p-5 md:p-6">
          <ProjectForm
            mode="create"
            clients={clients}
            meId={me.id}
            sources={sources}
            people={people.map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email, avatar_src: p.avatar_src, role: p.role }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
