import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ModulesView } from "@/components/admin/modules-view";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Modules" };

/** Administrators: who can use each module (e.g. Aftersales). */
export default async function ModulesPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: people }, access] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, email, role").eq("status", "active").order("first_name"),
    supabase.from("module_access").select("user_id, module, level"),
  ]);
  const header = (
    <>
      <Link href="/admin" className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Admin
      </Link>
      <PageHeader title="Modules" description="Parts of the app only chosen people can use. Administrators always have full access." />
    </>
  );
  if (access.error) {
    return (
      <>
        {header}
        <DatabaseUpdateNotice isAdmin />
      </>
    );
  }
  return (
    <>
      {header}
      <ModulesView
        people={(people ?? []).map((p) => ({ id: p.id, name: fullName(p), role: p.role }))}
        access={(access.data ?? []).map((a) => ({ userId: a.user_id, module: a.module, level: a.level }))}
      />
    </>
  );
}
