"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Supabase client for Client Components (uses the signed-in user's session). */
export function createClient() {
  browserClient ??= createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
  return browserClient;
}
