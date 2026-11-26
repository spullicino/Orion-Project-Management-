"use server";

import { requireActiveProfile } from "@/lib/auth/session";
import type { BannerItem } from "@/lib/banner";
import { loadMyBanner } from "@/lib/data/banner";
import { createClient } from "@/lib/supabase/server";

/** Fetched again when the app comes back to the front, so new messages show without a reload. */
export async function getMyBanner(): Promise<BannerItem[]> {
  await requireActiveProfile();
  return loadMyBanner(await createClient());
}
