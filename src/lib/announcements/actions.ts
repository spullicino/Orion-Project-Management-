"use server";

import { createClient } from "@/lib/supabase/server";

export type UnreadAnnouncement = { id: string; title: string; body: string; created_at: string; sender: string };

/** Important messages sent to me that I haven't confirmed yet (oldest first). Empty on any error. */
export async function loadMyUnreadAnnouncements(): Promise<UnreadAnnouncement[]> {
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const me = claims?.claims?.sub;
    if (!me) return [];
    const { data: rows, error } = await supabase
      .from("announcement_recipients")
      .select("announcement_id")
      .eq("user_id", me)
      .is("read_at", null);
    if (error || !rows?.length) return [];
    const { data: list } = await supabase
      .from("announcements")
      .select("id, title, body, created_at, created_by")
      .in("id", rows.map((r) => r.announcement_id))
      .order("created_at");
    const senders = [...new Set((list ?? []).map((a) => a.created_by).filter((x): x is string => !!x))];
    const { data: people } = senders.length ? await supabase.from("profiles").select("id, first_name, last_name").in("id", senders) : { data: [] };
    const name = new Map((people ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
    return (list ?? []).map((a) => ({ id: a.id, title: a.title, body: a.body, created_at: a.created_at, sender: (a.created_by && name.get(a.created_by)) || "Administrator" }));
  } catch {
    return [];
  }
}

/** "I've read this". */
export async function markAnnouncementRead(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_announcement_read", { p_id: id });
  return !error;
}
