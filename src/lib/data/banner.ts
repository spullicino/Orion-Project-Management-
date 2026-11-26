import "server-only";
import type { BannerItem } from "@/lib/banner";
import type { createClient } from "@/lib/supabase/server";

/** The banner messages showing for the signed-in person now (empty before database update 0032). */
export async function loadMyBanner(supabase: Awaited<ReturnType<typeof createClient>>): Promise<BannerItem[]> {
  const { data, error } = await supabase.rpc("my_banner_messages");
  if (error || !data) return [];
  return data.map((b) => ({ id: b.id, body: b.body, link: b.link, tone: b.tone, ends_at: b.ends_at }));
}
