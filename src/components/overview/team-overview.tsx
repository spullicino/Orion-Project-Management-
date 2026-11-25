import { AlertTriangle, ArrowRight, ClipboardPenLine, Package } from "lucide-react";
import Link from "next/link";
import { UserAvatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { todayISO } from "@/lib/board";
import { getDailyFeed, getDailyStatus } from "@/lib/data/diary";
import { getMaterialRequests } from "@/lib/data/materials";
import { cn, formatDate, fullName } from "@/lib/utils";
import type { DailyStatus, DailyUpdate } from "@/types/diary";
import { groupByProject } from "@/lib/materials/group";
import { MATERIAL_STATUS, OPEN_STATUSES, type MaterialListItem } from "@/types/materials";

const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));

/** Urgent and late first, then the ones nobody has acted on yet, then newest. */
export function sortOpenRequests(list: MaterialListItem[]) {
  return list
    .filter((r) => OPEN_STATUSES.includes(r.status))
    .sort(
      (a, b) =>
        Number(b.urgent || b.late) - Number(a.urgent || a.late) ||
        Number(b.status === "requested") - Number(a.status === "requested") ||
        b.created_at.localeCompare(a.created_at),
    );
}

/**
 * Managers' and admins' at-a-glance view: today's daily updates (who has / hasn't posted)
 * and open material requests. Shown on Home and on the Overview page.
 */
export async function TeamOverview({ size = "compact" }: { size?: "compact" | "full" }) {
  const today = todayISO();
  const full = size === "full";
  // If a database update hasn't been run yet, the card just shows nothing rather than breaking Home.
  const [status, feed, requests] = await Promise.all([
    getDailyStatus(today).catch(() => null),
    getDailyFeed({ from: today, to: today, limit: full ? 15 : 3 }).catch(() => []),
    getMaterialRequests(null).catch(() => [] as MaterialListItem[]),
  ]);

  return <TeamOverviewCards size={size} status={status} feed={feed} requests={requests} />;
}

export function TeamOverviewCards({
  size,
  status,
  feed,
  requests,
}: {
  size: "compact" | "full";
  status: DailyStatus | null;
  feed: DailyUpdate[];
  requests: MaterialListItem[];
}) {
  const full = size === "full";
  const rows = status ?? [];
  const people = rows.flatMap((r) => r.people.map((p) => ({ ...p, project: r.project })));
  const posted = people.filter((p) => p.posted).length;
  const missing = people.filter((p) => !p.posted);
  const updatesToday = rows.reduce((n, r) => n + r.update_count, 0);

  const open = sortOpenRequests(requests);
  const fresh = open.filter((r) => r.status === "requested").length;
  const late = open.filter((r) => r.late).length;
  const maxMissing = full ? 20 : 4;
  // Grouped by project: urgent/late projects first.
  const groups = groupByProject(open);
  const maxProjects = full ? 50 : 4;
  const perProject = full ? 10 : 2;

  return (
    <section aria-labelledby="team-overview" className={cn("mb-4 grid grid-cols-1 gap-3", full ? "lg:grid-cols-2" : "md:grid-cols-2")}>
      <h2 id="team-overview" className="sr-only">
        Team overview
      </h2>

      <Card className="min-w-0">
        <CardContent className="grid min-w-0 grid-cols-1 gap-4 p-5">
          <Link href="/daily-update/team" className="flex min-h-11 items-center gap-3 rounded-lg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ClipboardPenLine className="size-6 text-primary" aria-hidden />
            <span className="flex-1 text-lg font-semibold">Daily updates today</span>
            <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
          </Link>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={updatesToday} label="Updates" />
            <Stat value={posted} label="Posted" />
            <Stat value={missing.length} label="Not yet" tone={missing.length ? "warn" : undefined} />
          </div>

          {missing.length > 0 && (
            <div className="min-w-0">
              <p className="mb-1 text-sm font-medium text-muted-foreground">Not posted yet</p>
              <ul className="grid grid-cols-1 gap-2">
                {missing.slice(0, maxMissing).map((p) => (
                  <li key={`${p.user_id}:${p.project.id}`} className="flex min-w-0 items-center gap-2 text-sm">
                    <UserAvatar person={p} src={p.avatar_src} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{fullName(p)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.project.name}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {missing.length > maxMissing && <p className="mt-1 text-sm text-muted-foreground">and {missing.length - maxMissing} more</p>}
            </div>
          )}

          {feed.length > 0 ? (
            <div className="min-w-0">
              <p className="mb-1 text-sm font-medium text-muted-foreground">Latest</p>
              <ul className="divide-y">
                {feed.map((u) => (
                  <li key={u.id}>
                    <Link href={`/daily-update/team#update-${u.id}`} className="block py-2 hover:bg-accent/40">
                      <span className="flex items-center gap-2 text-sm">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: u.project.color }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{fullName(u.author)}</span> <span className="text-muted-foreground">· {u.project.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{time(u.created_at)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 pl-4.5 text-sm text-muted-foreground">
                        {u.issues && <AlertTriangle className="mr-1 inline size-3.5 text-amber-600" aria-label="Has issues" />}
                        {u.work_done}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No updates posted yet today.</p>
          )}
          <Link href="/daily-update/team" className="flex h-11 items-center justify-center gap-1 rounded-lg border text-sm font-medium hover:bg-accent">
            See all daily updates <ArrowRight className="size-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardContent className="grid min-w-0 grid-cols-1 gap-4 p-5">
          <Link href="/materials" className="flex min-h-11 items-center gap-3 rounded-lg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Package className="size-6 text-primary" aria-hidden />
            <span className="flex-1 text-lg font-semibold">Material requests</span>
            <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
          </Link>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={fresh} label="New" tone={fresh ? "alert" : undefined} />
            <Stat value={open.length} label="Open" />
            <Stat value={late} label="Late" tone={late ? "alert" : undefined} />
          </div>
          {open.length > 0 ? (
            <div className="grid gap-3">
              {groups.slice(0, maxProjects).map((g) => (
                <section key={g.project.id} aria-label={g.project.name} className="grid gap-1">
                  <Link href={`/projects/${g.project.id}/materials`} className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/50 px-2 hover:bg-accent">
                    <span className="size-3 shrink-0 rounded-full" style={{ background: g.project.color }} aria-hidden />
                    <span className="line-clamp-2 min-w-0 flex-1 break-words py-1 text-sm font-semibold">{g.project.name}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
                      <span className="rounded-full bg-card px-2 py-0.5">{g.items.length} open</span>
                      {g.urgent > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-white">{g.urgent} urgent</span>}
                      {g.late > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{g.late} late</span>}
                    </span>
                  </Link>
                  <ul className="divide-y pl-2">
                    {g.items.slice(0, perProject).map((r) => (
                      <li key={r.id}>
                        <Link href={`/materials?request=${r.id}`} className="flex items-start gap-2 py-2 hover:bg-accent/40">
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="line-clamp-2 break-words">
                              <span className="font-medium">#{r.number}</span> {r.summary}
                            </span>
                            <span className="block truncate text-muted-foreground">
                              {[r.requested_by ? fullName(r.requested_by) : null, r.needed_by ? `needed ${formatDate(r.needed_by)}` : null].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold", MATERIAL_STATUS[r.status].tone)}>{MATERIAL_STATUS[r.status].label}</span>
                            {(r.urgent || r.late) && <span className="text-xs font-semibold text-destructive">{r.urgent ? "Urgent" : "Late"}</span>}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {g.items.length > perProject && (
                    <Link href={`/projects/${g.project.id}/materials`} className="pl-2 text-sm font-medium text-primary hover:underline">
                      +{g.items.length - perProject} more on this project
                    </Link>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No open requests — everything has been delivered.</p>
          )}
          {groups.length > maxProjects && <p className="-mt-1 text-sm text-muted-foreground">and {groups.length - maxProjects} more projects</p>}
          <Link href="/materials" className="flex h-11 items-center justify-center gap-1 rounded-lg border text-sm font-medium hover:bg-accent">
            See all requests <ArrowRight className="size-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "warn" | "alert" }) {
  return (
    <div
      className={cn(
        "rounded-lg p-3",
        tone === "alert" ? "bg-destructive/10 text-destructive" : tone === "warn" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "bg-muted",
      )}
    >
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}
