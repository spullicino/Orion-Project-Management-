import type { Metadata } from "next";
import { ClientsManager } from "@/components/clients/clients-manager";
import { PageHeader } from "@/components/layout/page-header";
import { hasRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listClients } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const me = await requireRole("manager");
  const clients = await listClients();
  const paths = clients.map((c) => c.logo_path).filter((p): p is string => !!p);
  const logos: Record<string, string> = {};
  if (paths.length) {
    const { data } = await (await createClient()).storage.from("branding").createSignedUrls(paths, 3600);
    data?.forEach((d) => d.path && d.signedUrl && (logos[d.path] = d.signedUrl));
  }
  return (
    <>
      <PageHeader title="Clients" description="Companies you run projects for. Their logo appears on Gantt exports and client links." />
      <div className="max-w-3xl">
        <ClientsManager clients={clients} logos={logos} canDelete={hasRole(me.role, "admin")} />
      </div>
    </>
  );
}
