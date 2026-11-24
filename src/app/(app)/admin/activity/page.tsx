import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityView, type ActivityPerson } from "@/components/admin/activity-view";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/session";
import { resolveAvatarUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity" };

const nowMs = () => Date.now();

/** Administrators: who is (and isn't) using the app. */
export default async function ActivityPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_user_activity");
  const people = (error ? [] : ((data ?? []) as unknown as ActivityPerson[])) as ActivityPerson[];
  const urls = await resolveAvatarUrls(supabase, people.map((p) => p.avatar_url));
  const withAvatars = people.map((p, i) => ({ ...p, avatar_src: urls[i] }));

  return (
    <>
      <Link href="/admin" className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Admin
      </Link>
      <PageHeader title="Activity" description="Who is using the app — and who isn't. Only administrators can see this page." />
      {error ? <DatabaseUpdateNotice isAdmin /> : <ActivityView people={withAvatars} now={nowMs()} />}
    </>
  );
}
