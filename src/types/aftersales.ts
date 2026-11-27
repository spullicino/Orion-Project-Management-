import type { TicketPriority, TicketStatus } from "@/types/database";

export type AsPerson = { id: string; name: string; level: "agent" | "manager" };
export type AsCategory = { id: string; name: string; active: boolean };
export type AsCustomer = { id: string; name: string; kind: "company" | "person"; phone: string | null; address: string | null; notes: string | null; client_id: string | null };
export type AsContact = { id: string; customer_id: string; name: string; email: string | null; phone: string | null };
export type AsSite = {
  id: string;
  customer_id: string;
  name: string;
  address: string | null;
  handover_date: string | null;
  warranty_end: string | null;
  project_id: string | null;
  notes: string | null;
};

/** One row on the Tickets list. */
export type TicketRow = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: "email" | "portal" | "staff";
  created_at: string;
  updated_at: string;
  last_customer_at: string | null;
  customer: string | null;
  site: string | null;
  category: string | null;
  assignee: string | null;
  assigned_to: string | null;
};

export type TicketMessage = {
  id: string;
  kind: "customer" | "reply" | "note" | "event";
  author: string | null;
  from_name: string | null;
  from_email: string | null;
  body: string;
  email_status: "pending" | "sent" | "failed" | null;
  email_to: string | null;
  email_error: string | null;
  created_at: string;
};
export type TicketFile = { id: string; file_name: string; mime_type: string | null; size_bytes: number | null; uploaded_by: string | null; uploader: string | null; created_at: string };

export type TicketDetail = {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: "email" | "portal" | "staff";
  category_id: string | null;
  customer_id: string | null;
  contact_id: string | null;
  site_id: string | null;
  assigned_to: string | null;
  created_at: string;
  created_by: string | null;
  creator: string | null;
  first_response_at: string | null;
  last_customer_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  messages: TicketMessage[];
  files: TicketFile[];
};

/** What the ticket screens need to choose from. */
export type AsLookups = {
  people: AsPerson[];
  categories: AsCategory[];
  customers: AsCustomer[];
  contacts: AsContact[];
  sites: AsSite[];
};
