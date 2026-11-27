import { ListChecks, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectsBrowser } from "@/components/projects/projects-browser";
import { can } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";
import { listProjects } from "@/lib/data/projects";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Projects" };

const VIEWS = [
  { key: "active", label: "Active" },
  { key: "archived", label: "All incl. archived" },
  { key: "templates", label: "Templates", managerOnly: true },
] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [{ view = "active" }, me] = await Promise.all([searchParams, requireActiveProfile()]);
  const isManager = can.createProjects(me.role);
  const current = VIEWS.find((v) => v.key === view && (!("managerOnly" in v) || isManager))?.key ?? "active";
  let projects: Awaited<ReturnType<typeof listProjects>>;
  try {
    projects = await listProjects({ archived: current === "archived", templates: current === "templates" });
  } catch (e) {
    if (e instanceof DatabaseUpdateNeeded) {
      return (
        <>
          <PageHeader title="Projects" />
          <DatabaseUpdateNotice isAdmin={me.role === "admin"} />
        </>
      );
    }
    throw e;
  }

  return (
    <>
      <PageHeader
        title="Projects"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/my-tasks">
                <ListChecks aria-hidden /> My Tasks
              </Link>
            </Button>
            {isManager && (
              <Button asChild>
                <Link href="/projects/new">
                  <Plus aria-hidden /> New project
                </Link>
              </Button>
            )}
          </>
        }
      />

      <nav aria-label="Which projects" className="mb-5 flex gap-2 overflow-x-auto">
        {VIEWS.filter((v) => !("managerOnly" in v) || isManager).map((v) => (
          <Link
            key={v.key}
            href={v.key === "active" ? "/projects" : `/projects?view=${v.key}`}
            aria-current={current === v.key ? "page" : undefined}
            className={cn(
              "flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium",
              current === v.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <ProjectsBrowser
        projects={projects}
        empty={
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {current === "templates"
                ? "No templates yet. Open a project, go to Settings and choose “Save as template”."
                : isManager
                  ? "No projects yet. Create the first one with “New project”."
                  : "You haven't been added to any projects yet. Ask a manager to add you."}
            </CardContent>
          </Card>
        }
      />
    </>
  );
}
