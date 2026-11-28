"use server";

import { z } from "zod";
import { requireActiveProfile } from "@/lib/auth/session";
import { HOME_CARD_LABEL } from "@/lib/home-layout";
import { createClient } from "@/lib/supabase/server";

const id = z.enum(Object.keys(HOME_CARD_LABEL) as [string, ...string[]]);
const schema = z.object({ order: z.array(id).max(20), hidden: z.array(id).max(20) }).nullable();

/** Saves this person's Home card order (null = back to the default). Kept on their account. */
export async function saveHomeLayout(layout: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireActiveProfile();
  const parsed = schema.safeParse(layout);
  if (!parsed.success) return { ok: false, error: "Invalid layout" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { home_layout: parsed.data } });
  return error ? { ok: false, error: "Couldn't save — check your connection and try again." } : { ok: true };
}
