import { NextResponse, type NextRequest } from "next/server";
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/remember";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  res.cookies.delete(SESSION_ONLY_COOKIE);
  return res;
}
