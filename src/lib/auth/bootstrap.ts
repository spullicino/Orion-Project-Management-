import "server-only";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * First-time setup: if BOOTSTRAP_ADMIN_EMAIL is set and there is no
 * Administrator yet, the person signing in with that email becomes the first
 * Administrator. After that it does nothing, so it is safe to leave set.
 */
export async function maybeBootstrapAdmin(user: { id: string; email?: string | null }) {
  const target = serverEnv.bootstrapAdminEmail;
  if (!target || user.email?.toLowerCase() !== target) return;
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("status", "active");
    if ((count ?? 0) > 0) return;
    await admin
      .from("profiles")
      .update({ role: "admin", status: "active", approved_at: new Date().toISOString() })
      .eq("id", user.id);
  } catch (e) {
    console.error("bootstrap admin failed", e);
  }
}
