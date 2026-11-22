import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { maybeBootstrapAdmin } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/remember";
import { safeNextPath } from "@/lib/validation/auth";

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change", "magiclink"];

/**
 * Links in our emails (confirm sign-up, reset password, invitation, change email)
 * point here with a token_hash. Verifying it signs the user in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type && TYPES.includes(type)) {
    // These sign-ins are always remembered on this device.
    (await cookies()).delete(SESSION_ONLY_COOKIE);
    const supabase = await createClient({ sessionOnly: false });
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user) {
      await maybeBootstrapAdmin(data.user);
      const dest = type === "recovery" || type === "invite" ? "/auth/set-password" : next;
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("That link is invalid or has expired. Please request a new one.")}`,
  );
}
