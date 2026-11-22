"use client";

import { notFound } from "next/navigation";
import { OutboxProvider } from "@/components/diary/outbox-provider";
import { MaterialsView } from "@/components/materials/materials-view";
import { addDays, todayISO } from "@/lib/board";
import type { MaterialListItem, MaterialRequestDetail } from "@/types/materials";

const t = todayISO();
const now = new Date().toISOString();
const P = { id: "p1", name: "Valletta Office Fit-out", color: "#2d57a3" };
const tina = { id: "u3", first_name: "Tina", last_name: "Camilleri" };
const list: MaterialListItem[] = [
  { id: "r3", number: 3, status: "requested", needed_by: addDays(t, 1), urgent: true, supplier: null, po_number: null, expected_date: null, created_at: now, updated_at: now, delivered_at: null, project: P, requested_by: tina, item_count: 2, summary: "Plasterboard 12.5mm ×40 sheets, Drywall screws ×2 boxes", photo_count: 1, comment_count: 1, late: false },
  { id: "r2", number: 2, status: "ordered", needed_by: addDays(t, -1), urgent: false, supplier: "Build Supplies Ltd", po_number: "PO-881", expected_date: addDays(t, 2), created_at: now, updated_at: now, delivered_at: null, project: P, requested_by: tina, item_count: 1, summary: "Cement ×20 bags", photo_count: 0, comment_count: 0, late: true },
  { id: "r1", number: 1, status: "delivered", needed_by: addDays(t, -6), urgent: false, supplier: "Malta Timber", po_number: null, expected_date: null, created_at: now, updated_at: now, delivered_at: now, project: P, requested_by: tina, item_count: 3, summary: "Timber battens 50x25 ×60 lengths, Wood glue ×4 pcs, Screws 4x40 ×5 boxes", photo_count: 0, comment_count: 0, late: false },
];
const detail: MaterialRequestDetail = {
  id: "r3", project_id: "p1", number: 3, status: "requested", requested_by: "u3", needed_by: addDays(t, 1), urgent: true,
  delivery_note: "Back gate on St Paul's Street. Call Tina on arrival.", supplier: null, po_number: null, expected_date: null, reject_reason: null,
  copied_from: null, ordered_at: null, delivered_at: null, created_at: now, updated_at: now,
  project: { ...P, code: "VAL-001", client: "Harbour Holdings Ltd" },
  requester: { ...tina, phone: "+356 7900 0000", email: "tech1@orion.test" },
  items: [
    { id: "i1", position: 1, name: "Plasterboard 12.5mm", quantity: 40, unit: "sheets", note: "Moisture resistant (green) for the bathrooms", delivered_qty: 0 },
    { id: "i2", position: 2, name: "Drywall screws 3.5x25", quantity: 2, unit: "boxes", note: null, delivered_qty: 0 },
  ],
  photos: [],
  comments: [{ id: "c1", body: "Is 15mm OK instead? 12.5 is out of stock this week.", created_at: now, author_id: "u2", author: { first_name: "Mark", last_name: "Borg" } }],
  events: [{ kind: "created", detail: null, created_at: now, actor: tina }],
};

/** Development-only preview of material requests (no database). */
export default function MaterialsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <OutboxProvider userId="preview">
      <main className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <h1 className="mb-4 text-2xl font-bold">Materials</h1>
        <MaterialsView
          meId="u2"
          projectId="p1"
          initial={list}
          initialMaterials={[
            { name: "Timber battens 50x25", unit: "lengths", delivered: 60, requested: 60, last_delivered: now, requests: [1] },
            { name: "Wood glue", unit: "pcs", delivered: 4, requested: 4, last_delivered: now, requests: [1] },
          ]}
          editable={[{ id: "p1", name: P.name }]}
          manageable={["p1"]}
          detailLoader={async () => ({ ok: true as const, data: detail })}
        />
      </main>
    </OutboxProvider>
  );
}
