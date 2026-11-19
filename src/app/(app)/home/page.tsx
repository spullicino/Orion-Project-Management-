import { ArrowRight, ClipboardPenLine, FolderKanban, MessagesSquare, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { can, ROLE_LABEL } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home" };

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Malta" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [{ denied }, profile, supabase] = await Promise.all([searchParams, requireActiveProfile(), createClient()]);

  const { count: projectCount } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("is_template", false)
    .neq("status", "archived");

  let pendingCount = 0;
  if (can.manageUsers(profile.role)) {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending");
    pendingCount = count ?? 0;
  }

  const shortcuts = [
    { href: "/projects", label: "Projects", detail: `${projectCount ?? 0} active`, icon: FolderKanban },
    ...(can.postDailyUpdate(profile.role)
      ? [{ href: "/daily-update", label: "Post a daily update", detail: "What did you do today?", icon: ClipboardPenLine }]
      : []),
    { href: "/chats", label: "Chats", detail: "Project and team conversations", icon: MessagesSquare },
  ];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${profile.first_name || "there"}`}
        description={
          <span className="inline-flex items-center gap-2">
            You are signed in as <Badge>{ROLE_LABEL[profile.role]}</Badge>
          </span>
        }
      />

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

      <p className="mt-8 text-sm text-muted-foreground">
        Your dashboard with tasks due, overdue work and project health arrives in the next phases.
      </p>
    </>
  );
}
