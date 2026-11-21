"use server";

import { requireActiveProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Remembers (on the person's account, so on every device) the newest update they've seen. */
export async function markWhatsNewSeen(id: string): Promise<{ ok: boolean }> {
  await requireActiveProfile();
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,60}$/.test(id)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { whats_new_seen: id } });
  return { ok: !error };
}
