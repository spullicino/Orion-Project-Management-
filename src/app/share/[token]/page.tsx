import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { cache } from "react";
import { SharedProjectView, type Shared } from "@/components/gantt/shared-project-view";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";


/** Looks the token up as an anonymous visitor (no cookies, no login). */
const loadShared = cache(async (token: string): Promise<Shared | null> => {
  if (!/^[A-Za-z0-9]{32,128}$/.test(token) || !env.supabaseUrl) return null;
  const anon = createSupabaseClient(env.supabaseUrl, env.supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await anon.rpc("get_shared_project", { p_token: token });
  if (error) {
    console.error("share link lookup failed", error.message);
    return null;
  }
  return (data as Shared | null) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const shared = await loadShared((await params).token);
  return {
    title: shared ? `${shared.project.name} – progress` : "Link not available",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await loadShared(token);

  if (!shared) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/orion-logo.png" alt="Orion" className="h-10 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/orion-logo-white.png" alt="Orion" className="hidden h-10 w-auto dark:block" />
        <Link2Off className="size-12 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-bold">This link isn&apos;t available</h1>
        <p className="max-w-md text-muted-foreground">It may have expired or been turned off. Please ask your Orion Group contact for a new link.</p>
      </main>
    );
  }

  const { project } = shared;
  let clientLogo: string | null = null;
  if (project.client?.logo_path) {
    try {
      const { data } = await createAdminClient().storage.from("branding").createSignedUrl(project.client.logo_path, 3600);
      clientLogo = data?.signedUrl ?? null;
    } catch {
      clientLogo = null;
    }
  }

  return <SharedProjectView shared={shared} clientLogo={clientLogo} />;
}
