import { NextResponse, type NextRequest } from "next/server";
import { todayISO } from "@/lib/board";
import { sendDigests } from "@/lib/notify/email";
import { sendPendingPush } from "@/lib/notify/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs once a day (Vercel Cron, see vercel.json): due/overdue reminders,
 * phone pushes, the email summary and housekeeping.
 * Protected by CRON_SECRET (Vercel sends it automatically as a Bearer token).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  const report: Record<string, unknown> = {};
  try {
    const admin = createAdminClient();
    const { data: due, error } = await admin.rpc("create_due_notifications");
    if (error) throw error;
    report.reminders = due;
    report.push = await sendPendingPush();
    report.email = await sendDigests(site, todayISO());
    await admin.rpc("cleanup_old_data");
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    console.error("daily job failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message, ...report }, { status: 500 });
  }
}
