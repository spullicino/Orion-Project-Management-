import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { gmailAuthUrl, gmailConfigured } from "@/lib/mail/gmail";
import { getModuleLevel } from "@/lib/modules";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** Aftersales managers: start "Connect Gmail" (Google asks to sign in as support@ and allow). */
export async function GET(request: NextRequest) {
  const me = await getCurrentProfile();
  if (!me || me.status !== "active") return NextResponse.redirect(new URL("/login", request.url));
  if ((await getModuleLevel(me, "aftersales")) !== "manager") return NextResponse.redirect(new URL("/aftersales/settings?gmail=denied", request.url));
  if (!gmailConfigured()) return NextResponse.redirect(new URL("/aftersales/settings?gmail=not-configured", request.url));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(gmailAuthUrl(await getSiteUrl(), state));
  res.cookies.set("as_gmail_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/aftersales/gmail", maxAge: 600 });
  return res;
}
