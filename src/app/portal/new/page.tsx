import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalNewRequest } from "@/components/portal/portal-views";
import { getPortal } from "@/lib/portal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New request" };

export default async function PortalNewPage() {
  const { email, me } = await getPortal();
  if (!email || !me) redirect("/portal");
  return <PortalNewRequest me={me} />;
}
