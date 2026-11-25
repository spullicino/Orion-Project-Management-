import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuditView } from "@/components/admin/audit-view";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import { loadAuditLog, loadRecycleBin } from "./actions";

export const metadata: Metadata = { title: "Audit log" };

/** Administrators: who changed or deleted what, and the recycle bin for deleted tasks. */
export default async function AuditPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [log, bin, { data: projects }, { data: people }] = await Promise.all([
    loadAuditLog({}),
    loadRecycleBin(),
    supabase.from("projects").select("id, name").eq("is_template", false).order("name"),
    supabase.from("profiles").select("id, first_name, last_name, email").order("first_name"),
  ]);
  return (
    <>
      <Link href="/admin" className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Admin
      </Link>
      <PageHeader title="Audit log" description="Who created, changed or deleted what, and when. Only administrators can see this page." />
      {!log.ok ? (
        <DatabaseUpdateNotice isAdmin />
      ) : (
        <AuditView
          initial={log.data.entries}
          initialMore={log.data.more}
          bin={bin.ok ? bin.data : []}
          projects={projects ?? []}
          people={(people ?? []).map((p) => ({ id: p.id, name: fullName(p) }))}
        />
      )}
    </>
  );
}
