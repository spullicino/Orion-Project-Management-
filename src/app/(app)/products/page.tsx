import type { Metadata } from "next";
import { DatabaseUpdateNotice } from "@/components/database-update-notice";
import { PageHeader } from "@/components/layout/page-header";
import { ProductsView } from "@/components/products/products-view";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/types/materials";

export const metadata: Metadata = { title: "Products" };

/** Managers: the product list workers choose from when requesting materials. */
export default async function ProductsPage() {
  const me = await requireRole("manager");
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select("id, name, unit, category, code, active").order("name").limit(5000);
  return (
    <>
      <PageHeader title="Products" description="The list workers pick from when they request materials." />
      {error ? <DatabaseUpdateNotice isAdmin={me.role === "admin"} /> : <ProductsView initial={(data ?? []) as Product[]} />}
    </>
  );
}
