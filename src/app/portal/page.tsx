import { PortalLogin } from "@/components/portal/portal-login";
import { PortalHome } from "@/components/portal/portal-views";
import { getPortal, type PortalTicketRow } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const { email, me } = await getPortal();
  if (email === null) return <PortalLogin />;
  if (!me) {
    return (
      <div className="mx-auto grid max-w-md gap-3 rounded-2xl border bg-card p-6 text-sm">
        <h1 className="text-xl font-bold">No requests for this email</h1>
        <p className="text-muted-foreground">
          <strong className="text-foreground">{email}</strong> isn&apos;t linked to an Orion Group customer account yet. Email{" "}
          <a className="font-medium text-primary hover:underline" href="mailto:support@oriongroup.com.mt">
            support@oriongroup.com.mt
          </a>{" "}
          and we&apos;ll add you.
        </p>
        <form action="/portal/signout" method="post">
          <button type="submit" className="h-11 font-medium text-primary hover:underline">
            Sign in with another email
          </button>
        </form>
      </div>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_tickets");
  return <PortalHome me={me} tickets={(data as PortalTicketRow[] | null) ?? []} />;
}
