import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BannerView, type AdminBanner } from "@/components/admin/banner-view";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";

const nowMs = () => Date.now();

export const metadata: Metadata = { title: "Banner" };

/** Administrators: announcements and reminders in the strip at the top of the app. */
export default async function BannerPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: people }, { data: projects }, bannersRes] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, email, role").eq("status", "active").order("first_name"),
    supabase.from("projects").select("id, name").eq("status", "active").eq("is_template", false).order("name"),
    supabase.from("banner_messages").select("*").order("position").order("created_at"),
  ]);
  const header = (
    <>
      <Link href="/admin" className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Admin
      </Link>
      <PageHeader title="Banner" description="Short announcements and reminders in a strip at the top of every screen. You choose who sees them and for how long." />
    </>
  );
  if (bannersRes.error) {
    return (
      <>
        {header}
        <DatabaseUpdateNotice isAdmin />
      </>
    );
  }
  const all = bannersRes.data ?? [];
  const everyone = new Map((people ?? []).map((p) => [p.id, fullName(p)]));
  // Ended: the latest 20 only.
  const now = nowMs();
  const ended = all.filter((b) => b.ends_at && new Date(b.ends_at).getTime() <= now).sort((a, b) => b.ends_at!.localeCompare(a.ends_at!)).slice(0, 20);
  const live = all.filter((b) => !b.ends_at || new Date(b.ends_at).getTime() > now);
  const banners: AdminBanner[] = [...live, ...ended].map((b) => ({
    id: b.id,
    body: b.body,
    link: b.link,
    tone: b.tone,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    paused: b.paused,
    audience_type: b.audience_type,
    audience_roles: b.audience_roles,
    audience_projects: b.audience_projects,
    audience_people: b.audience_people,
    author: (b.created_by && everyone.get(b.created_by)) || "an administrator",
  }));

  return (
    <>
      {header}
      <BannerView banners={banners} people={(people ?? []).map((p) => ({ id: p.id, name: fullName(p), role: p.role }))} projects={projects ?? []} />
    </>
  );
}
