import { Activity, Blocks, History, Megaphone, Flag } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import { InviteForm, OpenInvites } from "@/components/admin/invite-form";
import { PendingList } from "@/components/admin/pending-list";
import { SettingsForm } from "@/components/admin/settings-form";
import { SetupCard } from "@/components/admin/setup-card";
import { SpeedCheck } from "@/components/admin/speed-check";
import { emailConfigured } from "@/lib/notify/email";
import { pushConfigured } from "@/lib/notify/push";
import { UsersList } from "@/components/admin/users-list";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { resolveAvatarUrls } from "@/lib/storage";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

/** The 15-minute reminder job has called in within the last 40 minutes. */
function checkedRecently(iso: string | null | undefined) {
  return !!iso && Date.now() - new Date(iso).getTime() < 40 * 60 * 1000;
}

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const me = await requireRole("admin");
  const supabase = await createClient();

  const [{ data: profiles }, { data: invites }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*").order("first_name"),
    supabase
      .from("invites")
      .select("*")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("app_settings").select("*").eq("id", true).single(),
  ]);

  const all = profiles ?? [];
  const urls = await resolveAvatarUrls(supabase, all.map((p) => p.avatar_url));
  const avatarUrls = Object.fromEntries(all.map((p, i) => [p.id, urls[i]]));
  const pending = all.filter((p) => p.status === "pending");
  const others = all.filter((p) => p.status !== "pending");

  return (
    <>
      <PageHeader
        title="Admin"
        description="Approve people, set their level and manage settings."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/messages">
                <Megaphone aria-hidden /> Important messages
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/modules">
                <Blocks aria-hidden /> Modules
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/banner">
                <Flag aria-hidden /> Banner
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/audit">
                <History aria-hidden /> Audit log
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/activity">
                <Activity aria-hidden /> Activity — who&apos;s using the app
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Waiting for approval {pending.length > 0 && <Badge>{pending.length}</Badge>}
            </CardTitle>
            <CardDescription>Choose a level, then approve. Declined people can&apos;t sign in.</CardDescription>
          </CardHeader>
          <CardContent>
            <PendingList users={pending} avatarUrls={avatarUrls} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
            <CardDescription>They get an email link and are approved automatically at the level you choose.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm />
            <OpenInvites invites={invites ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>People ({others.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <UsersList users={others} avatarUrls={avatarUrls} meId={me.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>{settings && <SettingsForm settings={settings} />}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup: notifications & daily job</CardTitle>
            <CardDescription>What&apos;s switched on for this installation.</CardDescription>
          </CardHeader>
          <CardContent>
            <SetupCard
              status={{ push: pushConfigured(), cron: !!process.env.CRON_SECRET, email: emailConfigured() }}
              reminder={{ siteUrl: await getSiteUrl(), checkedAt: settings?.reminder_checked_at ?? null, migrated: settings?.daily_reminder_enabled !== undefined, running: checkedRecently(settings?.reminder_checked_at) }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Speed check</CardTitle>
            <CardDescription>Measured just now, when this page opened.</CardDescription>
          </CardHeader>
          <CardContent>
            <SpeedCheck supabase={supabase} userId={me.id} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
