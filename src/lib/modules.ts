import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

/** Parts of the app only some people can use. Administrators always can. */
export type ModuleName = "aftersales";
export type ModuleLevel = "agent" | "manager";

export const MODULES: Record<ModuleName, { label: string; description: string }> = {
  aftersales: { label: "Aftersales", description: "Support tickets from customers (support@), customers and their sites." },
};

/** This person's level in a module, or null (no access — also before database update 0033). */
export const getModuleLevel = cache(async (profile: Pick<Profile, "id" | "role" | "status">, module: ModuleName): Promise<ModuleLevel | null> => {
  if (profile.status !== "active") return null;
  if (profile.role === "admin") return "manager";
  const supabase = await createClient();
  const { data, error } = await supabase.from("module_access").select("level").eq("user_id", profile.id).eq("module", module).maybeSingle();
  if (error || !data) return null;
  return data.level;
});

/** Pages and actions of a module: signed in, active and allowed — otherwise back to Home. */
export async function requireModule(module: ModuleName, minimum: ModuleLevel = "agent"): Promise<{ profile: Profile; level: ModuleLevel }> {
  const profile = await requireActiveProfile();
  const level = await getModuleLevel(profile, module);
  if (!level || (minimum === "manager" && level !== "manager")) redirect("/home?denied=1");
  return { profile, level };
}
