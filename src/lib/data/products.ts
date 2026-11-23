import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/types/materials";

/** Active products for the request form. Empty (not an error) before database update 0021. */
export async function getActiveProducts(): Promise<Product[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select("id, name, unit, category, code, active").eq("active", true).order("name").limit(5000);
  if (error) return [];
  return (data ?? []) as Product[];
}
