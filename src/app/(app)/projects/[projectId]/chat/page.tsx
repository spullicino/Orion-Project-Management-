import { notFound, redirect } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** The project's "Chat" tab opens its chat channel. */
export default async function ProjectChat({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireActiveProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("channels").select("id").eq("project_id", projectId).maybeSingle();
  if (!data) notFound();
  redirect(`/chats/${data.id}`);
}
