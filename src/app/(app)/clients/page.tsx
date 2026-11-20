import type { Metadata } from "next";
import { ClientsManager } from "@/components/clients/clients-manager";
import { PageHeader } from "@/components/layout/page-header";
import { hasRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listClients } from "@/lib/data/projects";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const me = await requireRole("manager");
  const clients = await listClients();
  return (
    <>
      <PageHeader title="Clients" description="Companies you run projects for. Logos for client exports come with the Gantt charts." />
      <div className="max-w-3xl">
        <ClientsManager clients={clients} canDelete={hasRole(me.role, "admin")} />
      </div>
    </>
  );
}
