import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { DailyUpdateForm } from "@/components/diary/daily-update-form";
import { DiaryDays } from "@/components/diary/diary-card";
import { OutboxPanel } from "@/components/diary/outbox-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { can, hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { DatabaseUpdateNeeded } from "@/lib/data/db-errors";
import { getDailyFeed, getPostableProjects } from "@/lib/data/diary";

export const metadata: Metadata = { title: "Daily Update" };

export default async function DailyUpdatePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const [{ project }, me] = await Promise.all([searchParams, requireActiveProfile()]);
  const isManager = hasRole(me.role, "manager");
  const teamLink = isManager && (
    <Button asChild variant="outline">
      <Link href="/daily-update/team">
        <Users aria-hidden /> Team overview & reports
      </Link>
    </Button>
  );

  if (!can.postDailyUpdate(me.role)) {
    return (
      <>
        <PageHeader title="Daily Update" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Your level can view daily updates (open a project and go to its Diary tab) but can&apos;t post them.
          </CardContent>
        </Card>
      </>
    );
  }

  let projects, recent;
  try {
    [projects, recent] = await Promise.all([getPostableProjects(), getDailyFeed({ author: me.id, limit: 5 })]);
  } catch (e) {
    if (e instanceof DatabaseUpdateNeeded) return <><PageHeader title="Daily Update" /><DatabaseUpdateNotice isAdmin={me.role === "admin"} /></>;
    throw e;
  }

  return (
    <>
      <PageHeader title="Daily Update" description="What did you do today? Add photos straight from your phone." actions={teamLink} />
      <OutboxPanel />
      <Card className="mb-8">
        <CardContent className="p-5 md:p-6">
          <DailyUpdateForm projects={projects} initialProject={projects.some((p) => p.id === project) ? project : null} />
        </CardContent>
      </Card>
      {recent.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Your recent updates</h2>
          <DiaryDays updates={recent} me={{ id: me.id, isManager }} showProject />
        </>
      )}
    </>
  );
}
