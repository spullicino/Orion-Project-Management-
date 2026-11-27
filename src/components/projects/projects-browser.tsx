"use client";

import { AlertTriangle, ChevronRight, LayoutGrid, List, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { HealthBadge } from "@/components/health-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress";
import { healthSummary } from "@/lib/health";
import { cn, formatDate } from "@/lib/utils";
import type { ProjectSummary } from "@/types/board";

// Cards or List, remembered on this device.
const KEY = "orion-projects-view";
const EVENT = "orion-projects-view";
type Layout = "cards" | "list";
const readLayout = (): Layout => {
  try {
    return localStorage.getItem(KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const saveLayout = (l: Layout) => {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* private mode: just this visit */
  }
  window.dispatchEvent(new Event(EVENT));
};

const pct = (p: ProjectSummary) => (p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0);
const subtitle = (p: ProjectSummary) => [p.client?.name, p.code].filter(Boolean).join(" · ");

function ProjectCard({ p }: { p: ProjectSummary }) {
  return (
    <Link href={`/projects/${p.id}/board`} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full overflow-hidden transition-colors hover:bg-accent/40">
        <div className="h-1.5" style={{ background: p.color }} />
        <CardContent className="grid gap-3 p-5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-semibold leading-tight">{p.name}</p>
              {p.health && <HealthBadge level={p.health.level} title={healthSummary(p.health)} className="shrink-0" />}
            </div>
            <p className="text-sm text-muted-foreground">{subtitle(p) || " "}</p>
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {p.done_count} of {p.task_count} tasks done
              </span>
              <span className="font-semibold tabular-nums">{pct(p)}%</span>
            </div>
            <ProgressBar value={pct(p)} color={p.color} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {p.overdue_count > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle className="size-4" aria-hidden /> {p.overdue_count} overdue
              </span>
            )}
            {p.end_date && <span>Ends {formatDate(p.end_date)}</span>}
            <span>
              {p.member_ids.length} {p.member_ids.length === 1 ? "person" : "people"}
            </span>
            {p.status !== "active" && <span className="capitalize">{p.status.replace("_", " ")}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ProjectRow({ p }: { p: ProjectSummary }) {
  return (
    <Link href={`/projects/${p.id}/board`} className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2 hover:bg-accent/50 md:px-4">
      <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{p.name}</span>
        <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          {subtitle(p) && <span className="max-w-full truncate">{subtitle(p)}</span>}
          <span className="tabular-nums">
            {pct(p)}% · {p.done_count}/{p.task_count} tasks
          </span>
          {p.overdue_count > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-destructive">
              <AlertTriangle className="size-3.5" aria-hidden /> {p.overdue_count} overdue
            </span>
          )}
          {p.status !== "active" && <span className="capitalize">{p.status.replace("_", " ")}</span>}
        </span>
      </span>
      {p.health && <HealthBadge level={p.health.level} title={healthSummary(p.health)} className="hidden shrink-0 sm:inline-flex" />}
      {p.health && p.health.level !== "green" && (
        <span className={cn("size-2.5 shrink-0 rounded-full sm:hidden", p.health.level === "red" ? "bg-destructive" : "bg-amber-500")} aria-label={healthSummary(p.health)} />
      )}
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** The project list: search, and Cards or List (remembered on this device). */
export function ProjectsBrowser({ projects, empty }: { projects: ProjectSummary[]; empty: React.ReactNode }) {
  const layout = useSyncExternalStore(subscribe, readLayout, () => "cards" as Layout);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    if (!w) return projects;
    return projects.filter((p) => [p.name, p.code, p.client?.name].some((s) => s?.toLowerCase().includes(w)));
  }, [projects, q]);

  if (!projects.length) return <>{empty}</>;
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a project — name, code or client" aria-label="Find a project" className="pl-9 pr-10" />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div role="group" aria-label="Show projects as" className="flex shrink-0 rounded-lg border bg-card p-0.5">
          {(
            [
              ["cards", LayoutGrid, "Cards"],
              ["list", List, "List"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              aria-label={label}
              title={label}
              onClick={() => saveLayout(value)}
              className={cn("flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium", layout === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="size-4" aria-hidden /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {!shown.length ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No project matches “{q}”.</p>
      ) : layout === "list" ? (
        <ul className="grid divide-y overflow-hidden rounded-xl border bg-card">
          {shown.map((p) => (
            <li key={p.id}>
              <ProjectRow p={p} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <ProjectCard p={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
