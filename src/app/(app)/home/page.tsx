import { AlertTriangle, ArrowRight, NotebookTabs, UserPen, CalendarClock, ClipboardPenLine, FolderKanban, ListChecks, MessagesSquare, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { can, ROLE_LABEL } from "@/lib/auth/roles";
import { getSessionState, requireActiveProfile } from "@/lib/auth/session";
import { WhatsNewButton } from "@/components/whats-new";
import { hasRole } from "@/lib/auth/roles";
import { whatsNewFor } from "@/lib/whats-new";
import { todayISO } from "@/lib/board";
import { getMyTasks, listProjects } from "@/lib/data/projects";
import { HealthBadge } from "@/components/health-badge";
import { healthSummary } from "@/lib/health";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Malta" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [{ denied }, profile, supabase] = await Promise.all([searchParams, requireActiveProfile(), createClient()]);

  // Everything Home needs, fetched at the same time (not one after another).
  const [allMyTasks, { count: projectCount }, projects, pendingCount] = await Promise.all([
    // If the latest database update hasn't been run yet, show Home without the task summary.
    getMyTasks().catch(() => [] as Awaited<ReturnType<typeof getMyTasks>>),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("is_template", false).neq("status", "archived"),
    can.seeAllProjects(profile.role) ? listProjects().catch(() => []) : Promise.resolve([]),
    can.manageUsers(profile.role)
      ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending").then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);
  const myTasks = allMyTasks.filter((t) => !t.completed_at);
  const today = todayISO();
  const overdue = myTasks.filter((t) => t.due_date && t.due_date < today).length;
  const dueToday = myTasks.filter((t) => t.due_date === today).length;

  // Managers: projects whose health is amber or red, worst first.
  const attention = projects
    .filter((p) => p.health && p.health.level !== "green")
    .sort((a, b) => (a.health!.level === b.health!.level ? b.health!.red - a.health!.red : a.health!.level === "red" ? -1 : 1));

  const shortcuts = [
    { href: "/projects", label: "Projects", detail: `${projectCount ?? 0} active`, icon: FolderKanban },
    ...(can.postDailyUpdate(profile.role)
      ? [{ href: "/daily-update", label: "Post a daily update", detail: "What did you do today?", icon: ClipboardPenLine }]
      : []),
    { href: "/chats", label: "Chats", detail: "Project and team conversations", icon: MessagesSquare },
    { href: "/personal", label: "Personal", detail: "Your private to-dos and notes", icon: NotebookTabs },
  ];

  return (
    <>
      <PageHeader
        title={profile.first_name.trim() ? `${greeting()}, ${profile.first_name.trim()}` : greeting()}
        description={
          <span className="inline-flex items-center gap-2">
            You are signed in as <Badge>{ROLE_LABEL[profile.role]}</Badge>
          </span>
        }
        actions={<WhatsNewButton entries={whatsNewFor(profile.role, hasRole)} seen={(await getSessionState()).whatsNewSeen ?? null} />}
      />

      {!profile.first_name.trim() && (
        <Link href="/profile" className="mb-4 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Alert variant="info" className="flex items-center gap-3 [&>svg]:static [&>svg~*]:pl-0">
            <UserPen className="text-primary" aria-hidden />
            <AlertDescription className="flex-1">
              <span className="font-medium">Add your name</span> so colleagues recognise you on tasks, chats and daily updates.
            </AlertDescription>
            <ArrowRight className="size-4" aria-hidden />
          </Alert>
        </Link>
      )}

      {denied && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>You don&apos;t have access to that page.</AlertDescription>
        </Alert>
      )}

      {pendingCount > 0 && (
        <Link href="/admin" className="mb-4 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Alert variant="info" className="flex items-center gap-3 [&>svg]:static [&>svg~*]:pl-0">
            <UserCheck className="text-primary" aria-hidden />
            <AlertDescription className="flex-1 font-medium">
              {pendingCount} {pendingCount === 1 ? "person is" : "people are"} waiting for approval
            </AlertDescription>
            <ArrowRight className="size-4" aria-hidden />
          </Alert>
        </Link>
      )}

      <Link href="/my-tasks" className="mb-4 block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Card className="transition-colors hover:bg-accent/40">
          <CardContent className="grid gap-4 p-5">
            <div className="flex items-center gap-3">
              <ListChecks className="size-6 text-primary" aria-hidden />
              <span className="flex-1 text-lg font-semibold">My Tasks</span>
              <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className={overdue ? "rounded-lg bg-destructive/10 p-3 text-destructive" : "rounded-lg bg-muted p-3"}>
                <p className="text-2xl font-bold tabular-nums">{overdue}</p>
                <p className="flex items-center justify-center gap-1 text-xs font-medium">
                  <AlertTriangle className="size-3.5" aria-hidden /> Overdue
                </p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xl font-bold tabular-nums">{dueToday}</p>
                <p className="flex items-center justify-center gap-1 text-xs font-medium">
                  <CalendarClock className="size-3.5" aria-hidden /> Due today
                </p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xl font-bold tabular-nums">{myTasks.length}</p>
                <p className="text-xs font-medium">Open</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      {attention.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-5">
            <p className="mb-3 text-lg font-semibold">Projects that need attention</p>
            <ul className="divide-y">
              {attention.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}/dashboard`} className="flex items-center gap-3 py-2.5 hover:underline">
                    <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{healthSummary(p.health!)}</span>
                    </span>
                    <HealthBadge level={p.health!.level} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map(({ href, label, detail, icon: Icon }) => (
          <Link key={href} href={href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm text-muted-foreground">{detail}</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
