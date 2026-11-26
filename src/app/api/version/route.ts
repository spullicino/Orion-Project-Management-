import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Which build the server is running — open apps compare it with their own to offer "tap to update". */
export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "cache-control": "no-store" } });
}
