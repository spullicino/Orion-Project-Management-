import { AlertTriangle, ListChecks, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { can } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";
import { listProjects } from "@/lib/data/projects";
import { cn, formatDate } from "@/lib/utils";

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

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {current === "templates"
              ? "No templates yet. Open a project, go to Settings and choose “Save as template”."
              : isManager
                ? "No projects yet. Create the first one with “New project”."
                : "You haven't been added to any projects yet. Ask a manager to add you."}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}/board`} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="h-full overflow-hidden transition-colors hover:bg-accent/40">
                    <div className="h-1.5" style={{ background: p.color }} />
                    <CardContent className="grid gap-3 p-5">
                      <div>
                        <p className="text-lg font-semibold leading-tight">{p.name}</p>
                        <p className="text-sm text-muted-foreground">{[p.client?.name, p.code].filter(Boolean).join(" · ") || " "}</p>
                      </div>
                      <div className="grid gap-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {p.done_count} of {p.task_count} tasks done
                          </span>
                          <span className="font-semibold tabular-nums">{pct}%</span>
                        </div>
                        <ProgressBar value={pct} color={p.color} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {p.overdue_count > 0 && (
                          <span className="inline-flex items-center gap-1 font-medium text-destructive">
                            <AlertTriangle className="size-4" aria-hidden /> {p.overdue_count} overdue
                          </span>
                        )}
                        {p.end_date && <span>Ends {formatDate(p.end_date)}</span>}
                        <span>{p.member_ids.length} {p.member_ids.length === 1 ? "person" : "people"}</span>
                        {p.status !== "active" && <span className="capitalize">{p.status.replace("_", " ")}</span>}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
