import { NextResponse, type NextRequest } from "next/server";
import { syncMailbox } from "@/lib/mail/inbound";
import { sendPendingPush } from "@/lib/notify/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called every minute by a Supabase scheduled job (Aftersales → Settings shows the snippet):
 * reads new emails in support@ into tickets, then sends the phone notifications.
 * Accepts the reminders job's token (public.job_secrets) or CRON_SECRET.
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

  const result = await syncMailbox(admin);
  const push = result.ok && (result.imported || result.newTickets) ? await sendPendingPush() : null;
  // Always 200: problems are shown in Aftersales → Settings, not as failed jobs every minute.
  return NextResponse.json({ ...result, push });
}

export const GET = handle;
export const POST = handle;
