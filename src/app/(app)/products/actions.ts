"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/app/(app)/projects/actions";
import { hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { productImportSchema, productSchema } from "@/lib/validation/materials";
import type { Product } from "@/types/materials";

const uuid = z.string().uuid();
const fail = (error: string): Result<never> => ({ ok: false, error });
function friendly(m: string) {
  if (/relation .*products.* does not exist|schema cache/i.test(m)) return "Products need the latest database update (ask your administrator).";
  if (/duplicate key|products_name_unit_idx/i.test(m)) return "There's already a product with that name and unit.";
  if (/row-level security|permission denied/i.test(m)) return "Only managers and administrators can change products.";
  return m;
}
const refresh = () => {
  revalidatePath("/products");
  revalidatePath("/materials", "layout");
};

/** The product list (active only, unless managers ask for retired ones too). */
export async function loadProducts(includeRetired = false): Promise<Result<Product[]>> {
  await requireActiveProfile();
  const supabase = await createClient();
  let q = supabase.from("products").select("id, name, unit, category, code, active").order("category", { nullsFirst: false }).order("name");
  if (!includeRetired) q = q.eq("active", true);
  const { data, error } = await q.limit(5000);
  if (error) return fail(friendly(error.message));
  return { ok: true, data: (data ?? []) as Product[] };
}

export async function saveProduct(id: string | null, input: unknown): Promise<Result<Product>> {
  const me = await requireActiveProfile();
  if (!hasRole(me.role, "manager")) return fail("Only managers and administrators can change products.");
  if (id && !uuid.safeParse(id).success) return fail("Invalid product");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form");
  const supabase = await createClient();
  const q = id
    ? supabase.from("products").update(parsed.data).eq("id", id)
    : supabase.from("products").insert({ ...parsed.data, created_by: me.id });
  const { data, error } = await q.select("id, name, unit, category, code, active").single();
  if (error) return fail(friendly(error.message));
  refresh();
  return { ok: true, data: data as Product };
}

/** Retire (hide from the request form) or bring back a product. Past requests keep it. */
export async function setProductActive(id: string, active: boolean): Promise<Result> {
  const me = await requireActiveProfile();
  if (!hasRole(me.role, "manager")) return fail("Only managers and administrators can change products.");
  if (!uuid.safeParse(id).success) return fail("Invalid product");
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ active }).eq("id", id);
  if (error) return fail(friendly(error.message));
  refresh();
  return { ok: true };
}

/** Adds many products at once (pasted from Excel). Ones already in the list are skipped. */
export async function importProducts(input: unknown): Promise<Result<{ added: number; skipped: number }>> {
  const me = await requireActiveProfile();
  if (!hasRole(me.role, "manager")) return fail("Only managers and administrators can change products.");
  const parsed = productImportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the list");
  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("products").select("name, unit").limit(10000);
  if (readError) return fail(friendly(readError.message));
  const key = (p: { name: string; unit: string }) => `${p.name.trim().toLowerCase()}|${p.unit}`;
  const seen = new Set((existing ?? []).map(key));
  const fresh = parsed.data.filter((p) => {
    const k = key(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (fresh.length) {
    const { error } = await supabase.from("products").insert(fresh.map((p) => ({ ...p, created_by: me.id })));
    if (error) return fail(friendly(error.message));
  }
  refresh();
  return { ok: true, data: { added: fresh.length, skipped: parsed.data.length - fresh.length } };
}
