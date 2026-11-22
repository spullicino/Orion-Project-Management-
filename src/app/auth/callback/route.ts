import { NextResponse, type NextRequest } from "next/server";
import { maybeBootstrapAdmin } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/remember";
import { safeNextPath } from "@/lib/validation/auth";

/** Google sign-in returns here with a one-time code that we swap for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    // These sign-ins are always remembered on this device.
    (await cookies()).delete(SESSION_ONLY_COOKIE);
    const supabase = await createClient({ sessionOnly: false });
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await maybeBootstrapAdmin(data.user);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  const message = searchParams.get("error_description") ?? "Sign-in was cancelled or the link has expired.";
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}
