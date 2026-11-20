/**
 * Public (browser-safe) configuration. NEXT_PUBLIC_* values must be referenced
 * literally so Next.js can inline them at build time.
 */
/**
 * Keeps only "https://<ref>.supabase.co". People often paste the "RESTful endpoint"
 * (…supabase.co/rest/v1/) from the dashboard, which breaks sign-in with
 * "Invalid path specified in request URL".
 */
export function normaliseSupabaseUrl(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

export const env = {
  supabaseUrl: normaliseSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey:
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export function assertPublicEnv() {
  const missing = Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: env.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.supabasePublishableKey,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}. See README → "Environment variables".`);
  }
}
