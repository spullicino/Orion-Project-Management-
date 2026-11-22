import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const LIMITS = {
  login: { max: 10, windowSeconds: 300 },
  signup: { max: 5, windowSeconds: 3600 },
  passwordReset: { max: 5, windowSeconds: 3600 },
  invite: { max: 30, windowSeconds: 3600 },
  upload: { max: 120, windowSeconds: 600 },
  dailyPost: { max: 40, windowSeconds: 3600 },
  materialRequest: { max: 30, windowSeconds: 3600 },
  chatMessage: { max: 60, windowSeconds: 60 },
} as const;

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/**
 * Returns true if the action is allowed. Counts are stored in Postgres so the
 * limit holds across all Vercel server instances. Fails open (allows) if the
 * limiter itself is unavailable, so a hiccup never locks everybody out —
 * Supabase Auth has its own built-in limits as a second layer.
 */
export async function rateLimit(action: keyof typeof LIMITS, identifier: string) {
  const { max, windowSeconds } = LIMITS[action];
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_key: `${action}:${identifier.toLowerCase()}`,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data !== false;
  } catch (e) {
    console.error("rate limiter unavailable", e);
    return true;
  }
}
