import type { SupabaseClient } from "@supabase/supabase-js";

const SIGNED_URL_SECONDS = 60 * 60;

/** Resolves a stored avatar (storage path or external https URL) into a URL the browser can load. */
export async function resolveAvatarUrls(
  supabase: SupabaseClient,
  values: (string | null | undefined)[],
): Promise<(string | null)[]> {
  const paths = values.filter((v): v is string => Boolean(v) && !/^https?:\/\//.test(v!));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("avatars").createSignedUrls([...new Set(paths)], SIGNED_URL_SECONDS);
    data?.forEach((d) => d.path && d.signedUrl && signed.set(d.path, d.signedUrl));
  }
  return values.map((v) => {
    if (!v) return null;
    if (/^https?:\/\//.test(v)) return v;
    return signed.get(v) ?? null;
  });
}
