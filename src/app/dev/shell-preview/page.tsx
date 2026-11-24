import { ClipboardPenLine, ListChecks, Package } from "lucide-react";
import { notFound } from "next/navigation";
import { UnreadProvider } from "@/components/chat/unread-provider";
import { BottomTabs } from "@/components/layout/bottom-tabs";
import { MobileHeader } from "@/components/layout/mobile-header";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { TeamOverviewCards } from "@/components/overview/team-overview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WhatsNewButton } from "@/components/whats-new";
import { overviewFixture } from "@/dev/overview-fixture";
import { hasRole } from "@/lib/auth/roles";
import { whatsNewFor } from "@/lib/whats-new";
import type { Profile } from "@/types/database";

/** Development-only: the phone shell (header, page, bottom bar) around Home or Overview, with sample data. */
export default async function ShellPreview({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const page = (await searchParams).page === "overview" ? "overview" : "home";
  const now = new Date().toISOString();
  const profile: Profile = {
    id: "me",
    first_name: "Sarah",
    last_name: "Pullicino",
    email: "sarah@example.com",
    phone: null,
    avatar_url: null,
    role: "admin",
    status: "active",
    approved_by: null,
    approved_at: null,
    created_at: now,
    updated_at: now,
  };
  const data = overviewFixture();
  return (
    <UnreadProvider initial={3}>
      <NotificationsProvider userId="me" initial={2}>
        <div className="flex min-h-dvh">
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader profile={profile} avatarUrl={null} />
            <main
              id="main"
              className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8"
            >
              {page === "home" ? (
                <>
                  <PageHeader
                    title="Good afternoon, Sarah"
                    description={
                      <span className="inline-flex items-center gap-2">
                        You are signed in as <Badge>Administrator</Badge>
                      </span>
                    }
                    actions={
                      <WhatsNewButton
                        entries={whatsNewFor("admin", hasRole)}
                        seen={null}
                        preview
                      />
                    }
                  />
                  <TeamOverviewCards size="compact" {...data} />
                  <Card className="mb-4">
                    <CardContent className="flex items-center gap-3 p-5">
                      <ListChecks className="size-6 text-primary" aria-hidden />
                      <span className="flex-1 text-lg font-semibold">
                        My Tasks
                      </span>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  <PageHeader
                    title="Overview"
                    description="Today's daily updates and open material requests on your projects."
                    actions={
                      <div className="flex flex-wrap gap-2">
                        <Button>
                          <ClipboardPenLine aria-hidden /> Post an update
                        </Button>
                        <Button variant="outline">
                          <Package aria-hidden /> Request materials
                        </Button>
                      </div>
                    }
                  />
                  <TeamOverviewCards size="full" {...data} />
                </>
              )}
            </main>
          </div>
          <BottomTabs isManager newRequests={2} />
        </div>
      </NotificationsProvider>
    </UnreadProvider>
  );
}
