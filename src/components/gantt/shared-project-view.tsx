import { CalendarCheck, CheckCircle2, Diamond } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { todayISO } from "@/lib/board";
import type { GanttInput } from "@/lib/gantt/layout";
import { formatDate } from "@/lib/utils";
import { SharedGantt } from "./shared-gantt";

export type Shared = {
  link: { label: string | null; expires_at: string | null; hide_owners: boolean };
  project: {
    id: string;
    name: string;
    code: string | null;
    color: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
    client: { name: string; logo_path: string | null } | null;
  };
  labels: { id: string; name: string; color: string; is_done: boolean }[];
  groups: { id: string; name: string; color: string }[];
  tasks: {
    id: string;
    group_id: string;
    title: string;
    status_id: string | null;
    start_date: string | null;
    due_date: string | null;
    progress: number;
    completed_at: string | null;
    blocked_by: string[];
    owners: string[];
  }[];
  milestones: { id: string; title: string; date: string; color: string }[];
  generated_at: string;
};

/** The client-facing, read-only project page (used by /share/[token]). */
export function SharedProjectView({ shared, clientLogo }: { shared: Shared; clientLogo: string | null }) {
  const { project } = shared;
  const today = todayISO();
  const total = shared.tasks.length;
  const done = shared.tasks.filter((t) => t.completed_at).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const nextMilestone = shared.milestones.find((m) => m.date >= today);
  const byGroup = shared.groups
    .map((g) => {
      const ts = shared.tasks.filter((t) => t.group_id === g.id);
      return { ...g, total: ts.length, done: ts.filter((t) => t.completed_at).length };
    })
    .filter((g) => g.total > 0);

  const input: GanttInput = {
    tasks: shared.tasks,
    groups: shared.groups,
    milestones: shared.milestones,
    labels: shared.labels,
    projectStart: project.start_date,
    projectEnd: project.end_date,
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/orion-logo.png" alt="Orion Group" className="h-9 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/orion-logo-white.png" alt="Orion Group" className="hidden h-9 w-auto dark:block" />
        </div>
        {clientLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clientLogo} alt={project.client?.name ?? "Client"} className="h-10 max-w-40 object-contain" />
        )}
      </header>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{project.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {[project.client?.name, project.code, `Updated ${formatDate(shared.generated_at)}`].filter(Boolean).join(" · ")}
        </p>
      </div>

      <section aria-label="Summary" className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="grid gap-2 p-5">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" aria-hidden /> Overall progress
            </p>
            <p className="text-3xl font-bold tabular-nums">{pct}%</p>
            <ProgressBar value={pct} color={project.color} />
            <p className="text-sm text-muted-foreground">
              {done} of {total} tasks complete
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2 p-5">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Diamond className="size-4" aria-hidden /> Next milestone
            </p>
            {nextMilestone ? (
              <>
                <p className="text-lg font-semibold leading-tight">{nextMilestone.title}</p>
                <p className="text-muted-foreground">{formatDate(nextMilestone.date)}</p>
              </>
            ) : (
              <p className="text-muted-foreground">None scheduled</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2 p-5">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarCheck className="size-4" aria-hidden /> Planned dates
            </p>
            <p className="text-lg font-semibold leading-tight">
              {project.start_date ? formatDate(project.start_date) : "—"} → {project.end_date ? formatDate(project.end_date) : "—"}
            </p>
          </CardContent>
        </Card>
      </section>

      {byGroup.length > 0 && (
        <section aria-label="Progress by phase" className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {byGroup.map((g) => (
            <div key={g.id} className="grid gap-1.5 rounded-xl border bg-card p-4">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-3 rounded-sm" style={{ background: g.color }} aria-hidden />
                  {g.name}
                </span>
                <span className="text-muted-foreground">
                  {g.done}/{g.total}
                </span>
              </div>
              <ProgressBar value={(g.done / g.total) * 100} color={g.color} />
            </div>
          ))}
        </section>
      )}

      <section aria-label="Timeline">
        <h2 className="mb-3 text-lg font-semibold">Timeline</h2>
        <SharedGantt input={input} today={today} showOwners={!shared.link.hide_owners} legend={shared.labels.map((l) => ({ label: l.name, color: l.color }))} />
      </section>

      <footer className="mt-10 border-t pt-4 text-center text-xs text-muted-foreground">
        Shared by Orion Group via Orion Projects · read-only view
        {shared.link.expires_at ? ` · link valid until ${formatDate(shared.link.expires_at)}` : ""}
      </footer>
    </main>
  );
}
