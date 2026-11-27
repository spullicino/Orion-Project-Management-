import { NextResponse, type NextRequest } from "next/server";
import { sendPendingPush } from "@/lib/notify/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called every ~15 minutes by a Supabase scheduled job (see Admin → Setup).
 * Sends the daily update reminder when the time administrators chose has come,
 * then delivers any waiting phone notifications.
 * Accepts the job's own token (public.job_secrets) or CRON_SECRET.
 */
async function handle(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!given) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  let allowed = !!process.env.CRON_SECRET && given === process.env.CRON_SECRET;
  if (!allowed) {
    const { data } = await admin.from("job_secrets").select("token").eq("name", "reminders").maybeSingle();
    allowed = !!data?.token && data.token === given;
  }
  if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data: reminded, error } = await admin.rpc("queue_daily_update_reminders");
    if (error) throw error;
    // Important messages not read yet are sent again (database update 0025; before it this just errors).
    const { data: messages } = await admin.rpc("queue_announcement_reminders");
    // Aftersales response targets: warnings, missed targets, auto-close (database update 0036).
    const { data: tickets } = await admin.rpc("queue_ticket_sla_alerts");
    const push = await sendPendingPush();
    return NextResponse.json({ ok: true, reminded, messages: messages ?? 0, tickets: tickets ?? 0, push });
  } catch (e) {
    console.error("reminder job failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
