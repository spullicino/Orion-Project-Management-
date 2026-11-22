import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The proxy reads the Supabase settings when it's imported.
let updateSession: typeof import("@/lib/supabase/proxy").updateSession;
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  ({ updateSession } = await import("@/lib/supabase/proxy"));
});
afterEach(() => vi.unstubAllGlobals());

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const jwt = (exp: number) => `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify({ sub: "u1", exp, role: "authenticated" }))}.sig`;
const sessionCookie = (exp: number) =>
  "base64-" +
  b64url(JSON.stringify({ access_token: jwt(exp), refresh_token: "r1", expires_at: exp, expires_in: 3600, token_type: "bearer", user: { id: "u1" } }));

function request(cookie?: string, path = "/home") {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `sb-demo-auth-token=${cookie}`);
  return new NextRequest(`https://app.example${path}`, { headers });
}
const now = () => Math.floor(Date.now() / 1000);

describe("staying signed in", () => {
  it("a dropped connection while refreshing doesn't send you to the login page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const res = await updateSession(request(sessionCookie(now() - 60)));
    expect(res.headers.get("location")).toBeNull();
  }, 45_000); // Supabase keeps retrying for up to ~30 seconds first

  it("a sign-in that really ended (refresh token rejected) goes to the login page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "refresh_token_not_found", message: "Invalid Refresh Token" }), { status: 400, headers: { "content-type": "application/json" } })),
    );
    const res = await updateSession(request(sessionCookie(now() - 60)));
    expect(res.headers.get("location")).toMatch(/\/login\?next=%2Fhome/);
  });

  it("no saved sign-in at all goes to the login page", async () => {
    const res = await updateSession(request());
    expect(res.headers.get("location")).toMatch(/\/login/);
  });

  it("a valid sign-in is re-saved by the server once a day with a long lifetime (iPhone 7-day limit)", async () => {
    // Valid token: getClaims checks it with Supabase (HS256 → /user).
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "u1", aud: "authenticated" }), { status: 200, headers: { "content-type": "application/json" } })));
    const res = await updateSession(request(sessionCookie(now() + 3000)));
    expect(res.headers.get("location")).toBeNull();
    const set = res.headers.getSetCookie().join("\n");
    expect(set).toMatch(/sb-demo-auth-token=.*Max-Age=34560000/);
    expect(set).toMatch(/orion-auth-renewed=1/);
  });
});
