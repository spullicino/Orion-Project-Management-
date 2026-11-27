import "server-only";
import type { TicketStatus } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

export type PortalMe = { name: string | null; email: string; customer: string; shared: boolean; sites: { id: string; name: string }[] };
export type PortalTicketRow = { number: number; ref: string; subject: string; status: TicketStatus; created_at: string; updated_at: string; site: string | null; contact: string | null };
export type PortalTicket = {
  number: number;
  ref: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  resolved_at: string | null;
  site: string | null;
  category: string | null;
  handled_by: string | null;
  messages: { id: string; mine: boolean; who: string; body: string; created_at: string }[];
  files: { id: string; file_name: string; size_bytes: number | null; created_at: string }[];
};

/** Who's signed in to the portal: not signed in, signed in but not a customer contact, or a contact. */
export async function getPortal(): Promise<{ email: string | null; me: PortalMe | null }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { email: null, me: null };
  const { data } = await supabase.rpc("portal_me");
  return { email: (claims.claims.email as string | undefined) ?? "", me: (data as PortalMe | null) ?? null };
}
