import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertPublicEnv, env } from "@/lib/env";
import type { Database } from "@/types/database";
import { cookieOptionsFor, SESSION_ONLY_COOKIE } from "./remember";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts as the signed-in user, so every query is filtered by Row Level Security.
 */
export async function createClient(opts: { sessionOnly?: boolean } = {}) {
  assertPublicEnv();
  const cookieStore = await cookies();
  const sessionOnly = opts.sessionOnly ?? cookieStore.get(SESSION_ONLY_COOKIE)?.value === "1";
  return createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, cookieOptionsFor(value, options, sessionOnly)));
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes sessions.
        }
      },
    },
  });
}
