export type MaterialStatus = "requested" | "ordered" | "partly_delivered" | "delivered" | "rejected" | "cancelled";

export const MATERIAL_STATUS: Record<MaterialStatus, { label: string; tone: string }> = {
  requested: { label: "Requested", tone: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" },
  ordered: { label: "Ordered", tone: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
  partly_delivered: { label: "Partly delivered", tone: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100" },
  delivered: { label: "Delivered", tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  rejected: { label: "Rejected", tone: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100" },
  cancelled: { label: "Cancelled", tone: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
};
export const OPEN_STATUSES: MaterialStatus[] = ["requested", "ordered", "partly_delivered"];

type Person = { id?: string; first_name: string | null; last_name: string | null };

export type MaterialListItem = {
  id: string;
  number: number;
  status: MaterialStatus;
  needed_by: string | null;
  urgent: boolean;
  supplier: string | null;
  po_number: string | null;
  expected_date: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  project: { id: string; name: string; color: string };
  requested_by: Person | null;
  item_count: number;
  summary: string;
  photo_count: number;
  comment_count: number;
  late: boolean;
  /** How many delivery notes / invoices are attached (database update 0029). */
  doc_count?: number;
};

export type MaterialItem = { id: string; position: number; name: string; quantity: number; unit: string; note: string | null; delivered_qty: number; product_id?: string | null };

export type MaterialRequestDetail = {
  id: string;
  project_id: string;
  number: number;
  status: MaterialStatus;
  requested_by: string;
  needed_by: string | null;
  urgent: boolean;
  delivery_note: string | null;
  supplier: string | null;
  po_number: string | null;
  expected_date: string | null;
  reject_reason: string | null;
  copied_from: string | null;
  ordered_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  project: { id: string; name: string; color: string; code: string | null; client: string | null };
  requester: (Person & { phone: string | null; email: string | null }) | null;
  items: MaterialItem[];
  photos: { id: string; storage_path: string; width: number | null; height: number | null; url?: string | null; thumb_url?: string | null }[];
  comments: { id: string; body: string; created_at: string; author_id: string; author: Person | null }[];
  events: { kind: string; detail: string | null; created_at: string; actor: Person | null }[];
  /** Delivery notes, invoices… (database update 0029). */
  documents?: MaterialDocument[];
};

export type MaterialDocumentKind = "delivery_note" | "invoice" | "other";
export const DOCUMENT_KINDS: { value: MaterialDocumentKind; label: string }[] = [
  { value: "delivery_note", label: "Delivery note" },
  { value: "invoice", label: "Invoice" },
  { value: "other", label: "Other document" },
];
export type MaterialDocument = {
  id: string;
  kind: MaterialDocumentKind;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_by_name: string;
  created_at: string;
};

export type ProjectMaterial = { name: string; unit: string; delivered: number; requested: number; last_delivered: string | null; requests: number[] };

export const COMMON_UNITS = ["pcs", "boxes", "bags", "sheets", "m", "m²", "m³", "kg", "litres", "rolls", "lengths", "pallets", "sets"];

export type Product = { id: string; name: string; unit: string; category: string | null; code: string | null; active: boolean };

export type ReportLine = {
  product_id: string | null;
  name: string;
  unit: string;
  category: string | null;
  code: string | null;
  in_catalogue: boolean;
  delivered: number;
  requested: number;
  requests: number[];
  first_delivered: string | null;
  last_delivered: string | null;
};
