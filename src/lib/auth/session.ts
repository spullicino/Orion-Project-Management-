import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { maybeBootstrapAdmin } from "@/lib/auth/bootstrap";
import { hasRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/types/database";

export type SessionState = {
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  /** Why a signed-in user has no profile (shown on /account-problem). */
  problem: string | null;
};

/**
 * Creates the profile row for a signed-in user who doesn't have one — e.g. an
 * account created before the database tables were loaded. Uses the secret key,
 * but only ever for the caller's own, already-authenticated user id.
 */
async function repairMissingProfile(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: existing, error: readError } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (readError) return `Profiles table could not be read: ${readError.message}`;
    if (existing) return "Your profile exists but could not be loaded with your sign-in (database permissions).";

    const { data: authUser, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !authUser.user?.email) return `Your sign-in account could not be found: ${userError?.message ?? "no email"}`;
    const meta = (authUser.user.user_metadata ?? {}) as Record<string, string | undefined>;
    const full = meta.full_name ?? meta.name ?? "";
    const { error: insertError } = await admin.from("profiles").insert({
      id: userId,
      email: authUser.user.email,
      first_name: (meta.first_name ?? meta.given_name ?? full.split(" ")[0] ?? "").slice(0, 80),
      last_name: (meta.last_name ?? meta.family_name ?? full.split(" ").slice(1).join(" ")).slice(0, 80),
      avatar_url: meta.avatar_url ?? meta.picture ?? null,
      role: "basic",
      status: "pending",
    });
    if (insertError) return `Your profile could not be created: ${insertError.message}`;
    await maybeBootstrapAdmin({ id: userId, email: authUser.user.email });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Who is signed in, and their profile. Cached per request. */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub ?? null;
  const email = (claims?.claims?.email as string | undefined) ?? null;
  if (!userId) return { userId: null, email: null, profile: null, problem: null };

  const load = () => supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  let { data, error } = await load();
  if (data) return { userId, email, profile: data, problem: null };

  const problem = error ? `Could not load your profile: ${error.message}` : await repairMissingProfile(userId);
  if (!problem) {
    ({ data, error } = await load());
    if (data) return { userId, email, profile: data, problem: null };
  }
  return { userId, email, profile: null, problem: problem ?? error?.message ?? "Your profile could not be loaded." };
});

/** The signed-in user's profile, or null. */
export async function getCurrentProfile(): Promise<Profile | null> {
  return (await getSessionState()).profile;
}

/** Requires a signed-in, approved (active) user; otherwise redirects. */
export async function requireActiveProfile(): Promise<Profile> {
  const state = await getSessionState();
  if (!state.userId) redirect("/login");
  // Signed in but no profile: never send back to /login (that would loop).
  if (!state.profile) redirect("/account-problem");
  if (state.profile.status !== "active") redirect("/pending");
  return state.profile;
}

/** Requires at least the given level; otherwise sends the user home. */
export async function requireRole(minimum: AppRole): Promise<Profile> {
  const profile = await requireActiveProfile();
  if (!hasRole(profile.role, minimum)) redirect("/home?denied=1");
  return profile;
}
