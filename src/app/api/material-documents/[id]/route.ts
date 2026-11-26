import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function problem(message: string, status: number) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>File</title>
<body style="font-family:system-ui,sans-serif;padding:24px;line-height:1.5"><h1 style="font-size:20px">Can't open this file</h1><p>${message}</p><p><a href="javascript:history.back()">Go back</a></p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

/**
 * Opens a delivery note / invoice: /api/material-documents/<id> shows it, ?download=1 saves it.
 * A plain link (opened straight from the tap) works on iPhone, unlike opening a
 * window after waiting for the server. Only people who can see the task's project
 * get the file (the database rules decide), via a link valid for 10 minutes.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return problem("This link isn't valid.", 400);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url));

  const { data: att } = await supabase.from("material_request_documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!att) return problem("The document was removed, or you don't have access to its project.", 404);

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage.from("project-files").createSignedUrl(att.storage_path, 60 * 10, download ? { download: att.file_name } : undefined);
  if (error || !data) return problem("The file couldn't be found in storage. Try uploading it again.", 404);
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "no-store" } });
}
