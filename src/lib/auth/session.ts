import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/auth/roles";
import type { AppRole, Profile } from "@/types/database";

/** The signed-in user's profile, or null. Cached per request. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
});

/** Requires a signed-in, approved (active) user; otherwise redirects. */
export async function requireActiveProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active") redirect("/pending");
  return profile;
}

/** Requires at least the given level; otherwise sends the user home. */
export async function requireRole(minimum: AppRole): Promise<Profile> {
  const profile = await requireActiveProfile();
  if (!hasRole(profile.role, minimum)) redirect("/home?denied=1");
  return profile;
}
