import { ClipboardPenLine, Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { TeamOverview } from "@/components/overview/team-overview";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Overview" };

/** Managers and admins: today's daily updates and open material requests on one screen. */
export default async function OverviewPage() {
  const me = await requireRole("manager");
  return (
    <>
      <PageHeader
        title="Overview"
        description="Today's daily updates and open material requests on your projects."
        actions={
          can.postDailyUpdate(me.role) && (
            <div className="flex flex-wrap gap-2">
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
            </div>
          )
        }
      />
      <TeamOverview size="full" />
    </>
  );
}
