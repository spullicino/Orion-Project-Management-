import { ClipboardPenLine, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { TeamOverview } from "@/components/overview/team-overview";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { ExportUpdatesButton } from "@/components/diary/export-dialog";
import { todayISO } from "@/lib/board";
import { listActivePeople, listProjects } from "@/lib/data/projects";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

/** Managers and admins: today's daily updates and open material requests on one screen. */
export default async function OverviewPage() {
  const me = await requireRole("manager");
  const [projects, people] = await Promise.all([
    listProjects().catch(() => []),
    listActivePeople().catch(() => []),
  ]);
  const exportButton = (
    <ExportUpdatesButton
      today={todayISO()}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      people={people
        .filter((p) => p.role !== "basic")
        .map((p) => ({ id: p.id, name: fullName(p) }))}
    />
  );
  return (
    <>
      <PageHeader
        title="Overview"
        description="Today's daily updates and open material requests on your projects."
        actions={
          <div className="flex flex-wrap gap-2">
            {can.postDailyUpdate(me.role) && (
              <>
                <Button asChild>
                  <Link href="/daily-update">
                    <ClipboardPenLine aria-hidden /> Post an update
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/materials?new=1">
                    <Package aria-hidden /> Request materials
                  </Link>
                </Button>
              </>
            )}
            {exportButton}
          </div>
        }
      />
      <TeamOverview size="full" />
    </>
  );
}
