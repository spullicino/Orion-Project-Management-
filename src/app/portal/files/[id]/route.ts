import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A file on a customer's request (portal). The database decides whether they may see it. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.redirect(new URL("/portal", request.url));
  const { data } = await supabase.rpc("portal_file_path", { p_file: id });
  const f = data as { path: string; name: string } | null;
  if (!f) return new NextResponse("This file isn't available.", { status: 404 });
  // Admin client: customers can't read storage themselves. Checked: portal_file_path (above).
  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data: signed } = await createAdminClient().storage.from("aftersales").createSignedUrl(f.path, 600, download ? { download: f.name } : undefined);
  if (!signed) return new NextResponse("This file couldn't be found.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "cache-control": "no-store" } });
}
