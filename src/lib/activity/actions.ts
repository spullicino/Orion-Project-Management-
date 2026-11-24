"use server";

import { createClient } from "@/lib/supabase/server";

/** Notes that the signed-in person is using the app (for Admin → Activity). Silent on any error. */
export async function touchLastSeen(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("touch_last_seen");
  } catch {
    /* offline, or database update 0024 not run yet */
  }
}
