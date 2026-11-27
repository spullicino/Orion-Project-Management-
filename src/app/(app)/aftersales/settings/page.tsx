import type { Metadata } from "next";
import { AftersalesSettings } from "@/components/aftersales/settings-view";
import { PageHeader } from "@/components/layout/page-header";
import { requireModule } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings · Aftersales" };

export default async function AftersalesSettingsPage() {
  const { level } = await requireModule("aftersales");
  const supabase = await createClient();
  const { data: categories } = await supabase.from("as_categories").select("id, name, active").order("position");
  return (
    <>
      <PageHeader title="Aftersales settings" />
      <AftersalesSettings categories={categories ?? []} isManager={level === "manager"} />
    </>
  );
}
