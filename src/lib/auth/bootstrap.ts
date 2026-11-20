import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * First-time setup: if BOOTSTRAP_ADMIN_EMAIL is set and there is no
 * Administrator yet, the person signing in with that email becomes the first
 * Administrator. After that it does nothing, so it is safe to leave set.
 */
export async function maybeBootstrapAdmin(user: { id: string; email?: string | null }): Promise<boolean> {
  const target = serverEnv.bootstrapAdminEmail;
  if (!target || user.email?.toLowerCase() !== target) return false;
  try {
    const admin = createAdminClient();
    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("status", "active");
    if (countError) throw countError;
    if ((count ?? 0) > 0) return false;
    const { error } = await admin
      .from("profiles")
      .update({ role: "admin", status: "active", approved_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("bootstrap admin failed", e);
    return false;
  }
}
