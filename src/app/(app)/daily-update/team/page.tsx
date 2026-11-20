import { ArrowLeft, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DiaryFeed } from "@/components/diary/diary-feed";
import { ReportButton } from "@/components/diary/report-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { addDays, todayISO } from "@/lib/board";
import { dayLabel } from "@/lib/calendar";
import { getDailyFeed, getDailyStatus } from "@/lib/data/diary";
import { listActivePeople, listProjects } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { cn, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Team daily updates" };

export default async function TeamDiaryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const me = await requireRole("manager");
  const today = todayISO();
  const raw = (await searchParams).date;
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;

  const supabase = await createClient();
  const [status, feed, people, projects, { data: settings }] = await Promise.all([
    getDailyStatus(date),
    getDailyFeed({ from: date, to: date, limit: 20 }),
    listActivePeople(),
    listProjects(),
    supabase.from("app_settings").select("daily_update_weekdays").eq("id", true).maybeSingle(),
  ]);
  const isoWeekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const workingDay = (settings?.daily_update_weekdays ?? [1, 2, 3, 4, 5]).includes(isoWeekday);
  const rows = status ?? [];
  const missing = rows.flatMap((r) => r.people.filter((p) => !p.posted).map((p) => ({ ...p, project: r.project.name })));
  const expected = rows.reduce((n, r) => n + r.people.length, 0);

  return (
    <>
      <Link href="/daily-update" className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Daily Update
      </Link>
      <PageHeader
        title="Team daily updates"
        description="Who has posted, what was done, and PDF reports for clients."
        actions={
          <ReportButton
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              client: p.client?.name ?? null,
              people: rows.find((r) => r.project.id === p.id)?.people ?? [],
            }))}
          />
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label="Previous day">
          <Link href={`/daily-update/team?date=${addDays(date, -1)}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="min-w-0 flex-1 text-center text-lg font-semibold sm:flex-none sm:px-4">
          {date === today ? "Today · " : ""}
          {dayLabel(date)}
        </h2>
        <Button asChild variant="outline" size="icon" aria-label="Next day" className={cn(date >= today && "pointer-events-none opacity-40")}>
          <Link href={`/daily-update/team?date=${addDays(date, 1)}`} aria-disabled={date >= today}>
            <ChevronRight />
          </Link>
        </Button>
        {date !== today && (
          <Button asChild variant="ghost">
            <Link href="/daily-update/team">Today</Link>
          </Button>
        )}
      </div>

      {!workingDay && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">This is not a normal working day, so missing updates may be expected.</p>}

      <Card className="mb-4">
        <CardContent className="p-5">
          <p className="text-lg font-semibold">
            {expected === 0
              ? "No technicians are assigned to active projects."
              : missing.length === 0
                ? "Everyone has posted. 🎉"
                : `${expected - missing.length} of ${expected} have posted · ${missing.length} still to post`}
          </p>
          {missing.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {missing.map((p) => (
                <li key={`${p.user_id}-${p.project}`} className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 py-1 pl-1 pr-3 text-sm">
                  <UserAvatar person={p} src={p.avatar_src} size={26} />
                  {fullName(p)} <span className="text-muted-foreground">· {p.project}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ul className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const posted = r.people.filter((p) => p.posted).length;
          return (
            <li key={r.project.id}>
              <Card className="h-full">
                <CardContent className="grid gap-3 p-4">
                  <Link href={`/projects/${r.project.id}/diary`} className="flex items-center gap-2 font-semibold hover:underline">
                    <span className="size-3 rounded-full" style={{ background: r.project.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.project.name}</span>
                    <span className="text-sm font-normal text-muted-foreground">{r.update_count} {r.update_count === 1 ? "update" : "updates"}</span>
                  </Link>
                  {r.people.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No technicians on this project.</p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {posted} of {r.people.length} posted
                      </p>
                      <ul className="grid gap-1.5">
                        {r.people.map((p) => (
                          <li key={p.user_id} className="flex items-center gap-2 text-sm">
                            <UserAvatar person={p} src={p.avatar_src} size={28} />
                            <span className="flex-1 truncate">{fullName(p)}</span>
                            {p.posted ? (
                              <span className="inline-flex items-center gap-1 text-success"><Check className="size-4" aria-hidden /> Posted</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-destructive"><X className="size-4" aria-hidden /> Not yet</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <h2 className="mb-3 text-lg font-semibold">Updates</h2>
      <DiaryFeed
        key={date}
        initial={feed}
        baseQuery={{ from: date, to: date }}
        me={{ id: me.id, isManager: true }}
        people={people.map((p) => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        showProject
        emptyText="No updates posted on this day."
      />
    </>
  );
}
