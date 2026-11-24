import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MessagesView, type SentMessage } from "@/components/admin/messages-view";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Important messages" };

/** Administrators: send messages people can't miss, and see who has read them. */
export default async function MessagesPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: people }, { data: projects }, sentRes] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, email, role").eq("status", "active").order("first_name"),
    supabase.from("projects").select("id, name").eq("status", "active").eq("is_template", false).order("name"),
    supabase.from("announcements").select("id, title, body, remind_every_hours, created_at, created_by").order("created_at", { ascending: false }).limit(50),
  ]);
  if (sentRes.error) {
    return (
      <>
        <PageHeader title="Important messages" />
        <DatabaseUpdateNotice isAdmin />
      </>
    );
  }
  const sent = sentRes.data ?? [];
  const { data: recipients } = sent.length
    ? await supabase.from("announcement_recipients").select("announcement_id, user_id, read_at, times_sent").in("announcement_id", sent.map((s) => s.id))
    : { data: [] };
  const everyone = new Map((people ?? []).map((p) => [p.id, p]));
  const missing = [...new Set((recipients ?? []).map((r) => r.user_id).filter((id) => !everyone.has(id)))];
  if (missing.length) {
    const { data: more } = await supabase.from("profiles").select("id, first_name, last_name, email, role").in("id", missing);
    for (const p of more ?? []) everyone.set(p.id, p);
  }
  const name = (id: string | null) => (id && everyone.get(id) ? fullName(everyone.get(id)!) : "Someone");
  const list: SentMessage[] = sent.map((s) => ({
    ...s,
    sender: name(s.created_by),
    recipients: (recipients ?? [])
      .filter((r) => r.announcement_id === s.id)
      .map((r) => ({ user_id: r.user_id, name: name(r.user_id), read_at: r.read_at, times_sent: r.times_sent }))
      .sort((a, b) => Number(!!a.read_at) - Number(!!b.read_at) || a.name.localeCompare(b.name)),
  }));

  return (
    <>
      <Link href="/admin" className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Admin
      </Link>
      <PageHeader title="Important messages" description="Messages people can't miss: a phone notification that stays on screen and a full-screen message they must confirm." />
      <MessagesView people={(people ?? []).map((p) => ({ id: p.id, name: fullName(p), role: p.role }))} projects={projects ?? []} sent={list} />
    </>
  );
}
