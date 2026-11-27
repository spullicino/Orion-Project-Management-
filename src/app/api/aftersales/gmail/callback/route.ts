import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { exchangeCode, gmailApi } from "@/lib/mail/gmail";
import { getModuleLevel } from "@/lib/modules";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google sends the manager back here after "Allow": keep the mailbox's keys (server only). */
export async function GET(request: NextRequest) {
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/aftersales/settings?gmail=${result}`, request.url));
    res.cookies.delete({ name: "as_gmail_state", path: "/api/aftersales/gmail" });
    return res;
  };
  const me = await getCurrentProfile();
  if (!me || me.status !== "active") return NextResponse.redirect(new URL("/login", request.url));
  if ((await getModuleLevel(me, "aftersales")) !== "manager") return back("denied");

  const p = request.nextUrl.searchParams;
  const state = request.cookies.get("as_gmail_state")?.value ?? "";
  if (p.get("error")) return back("cancelled");
  if (!state || !same(state, p.get("state") ?? "") || !p.get("code")) return back("failed");

  try {
    const t = await exchangeCode(p.get("code")!, await getSiteUrl());
    if (!t.refresh_token) return back("no-refresh");
    const { emailAddress } = await gmailApi(t.access_token).profile();
    const now = new Date().toISOString();
    const admin = createAdminClient();
    const { error } = await admin
      .from("as_mail_settings")
      .update({
        mailbox: emailAddress.toLowerCase(),
        refresh_token: t.refresh_token,
        access_token: t.access_token,
        access_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        label_id: null,
        connected_at: now,
        connected_by: me.id,
        import_after: now, // only emails from now on
        last_error: null,
        last_error_at: null,
        sync_lock_at: null,
      })
      .eq("id", true);
    if (error) throw error;
    return back("connected");
  } catch (e) {
    console.error("gmail connect failed", e);
    return back("failed");
  }
}
