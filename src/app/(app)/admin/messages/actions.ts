"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { queuePush } from "@/lib/notify/queue";
import { createClient } from "@/lib/supabase/server";
import { announcementSchema, type AnnouncementInput } from "@/lib/validation/announcements";

type Result = { ok: true; sentTo: number } | { ok: false; error: string };

/** Administrators: send an important message to everyone / levels / projects / chosen people. */
export async function sendAnnouncement(input: AnnouncementInput): Promise<Result> {
  await requireRole("admin");
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the message" };
  const { title, body, audience, remindEveryHours } = parsed.data;
  const supabase = await createClient();

  let userIds: string[] = [];
  if (audience.type === "people") userIds = audience.userIds;
  else if (audience.type === "projects") {
    const { data, error } = await supabase.from("project_members").select("user_id").in("project_id", audience.projectIds);
    if (error) return { ok: false, error: error.message };
    userIds = (data ?? []).map((r) => r.user_id);
  } else {
    let q = supabase.from("profiles").select("id").eq("status", "active");
    if (audience.type === "levels") q = q.in("role", audience.roles);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    userIds = (data ?? []).map((r) => r.id);
  }
  userIds = [...new Set(userIds)];
  if (!userIds.length) return { ok: false, error: "Nobody matches — choose who should get it." };

  const { error } = await supabase.rpc("send_announcement", {
    p_title: title,
    p_body: body,
    p_user_ids: userIds,
    p_remind_every_hours: remindEveryHours,
  });
  if (error) return { ok: false, error: /does not exist|schema cache/.test(error.message) ? "Run database update 0025 first." : error.message };
  queuePush(); // phone notifications go out straight away
  revalidatePath("/admin/messages");
  return { ok: true, sentTo: userIds.length };
}

export async function deleteAnnouncement(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/messages");
  return { ok: true };
}
