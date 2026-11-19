import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Privileged client using the SECRET key. It bypasses Row Level Security, so
 * only use it in server code AFTER checking the caller's permissions
 * (e.g. requireRole("admin")), and for system tasks like rate limiting.
 */
export function createAdminClient() {
  if (!serverEnv.supabaseSecretKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY. See README → \"Environment variables\".");
  }
  return createSupabaseClient<Database>(env.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
