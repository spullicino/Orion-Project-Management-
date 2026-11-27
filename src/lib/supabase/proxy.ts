import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { cookieOptionsFor, SESSION_ONLY_COOKIE } from "./remember";

/** Routes that work without being signed in. */
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/check-email",
  "/forgot-password",
  "/auth", // callback, confirm, sign-out, set-password (which checks its own session)
  "/share", // client read-only Gantt links (phase 3)
  "/offline",
  "/api/cron", // checks its own secret (CRON_SECRET)
  "/portal", // Aftersales customer portal: signs in by emailed link, checks its own session
];

export function isPublicPath(pathname: string) {
  // Development-only previews with sample data (the pages themselves 404 in production).
  if (process.env.NODE_ENV === "development" && pathname.startsWith("/dev/")) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors to the login page. Approval status (pending / deactivated) is
 * checked in the app layout, and enforced again in the database by RLS.
 */
/** Supabase's sign-in cookies (they can be split into chunks: sb-<ref>-auth-token.0, .1 …). */
const isAuthCookie = (name: string) => /^sb-.+-auth-token(\.\d+)?$/.test(name);
const RENEWED_COOKIE = "orion-auth-renewed";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let refreshed = false;

  if (!env.supabaseUrl || !env.supabasePublishableKey) return response;

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        refreshed = true;
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        const sessionOnly = request.cookies.get(SESSION_ONLY_COOKIE)?.value === "1";
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, cookieOptionsFor(value, options, sessionOnly)));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes the session.
  // (Supabase already retries a dropped connection for a few seconds before giving up.)
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const hasSession = request.cookies.getAll().some((c) => isAuthCookie(c.name) && c.value);
  const { pathname, search } = request.nextUrl;

  // Still can't reach the sign-in server, but the person has a saved sign-in: let the page
  // show "couldn't connect, try again" instead of sending them to the login screen.
  const connectionProblem = !signedIn && hasSession && !!error && isAuthRetryableFetchError(error);

  if (!signedIn && !connectionProblem && !isPublicPath(pathname) && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // "Keep me signed in": re-save the sign-in cookies from the server once a day. iPhones
  // (Safari's tracking protection) cut cookies written by the page itself down to 7 days;
  // cookies the server sends keep their full lifetime.
  const sessionOnly = request.cookies.get(SESSION_ONLY_COOKIE)?.value === "1";
  if (signedIn && !refreshed && !sessionOnly && !request.cookies.get(RENEWED_COOKIE)) {
    const secure = request.nextUrl.protocol === "https:";
    for (const c of request.cookies.getAll()) {
      if (isAuthCookie(c.name) && c.value) response.cookies.set(c.name, c.value, { path: "/", sameSite: "lax", secure, maxAge: 400 * 24 * 60 * 60 });
    }
    response.cookies.set(RENEWED_COOKIE, "1", { path: "/", sameSite: "lax", secure, httpOnly: true, maxAge: 60 * 60 * 24 });
  }

  return response;
}
