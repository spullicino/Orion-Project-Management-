"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { GanttChart } from "@/components/gantt/gantt-chart";
import { ExportDialog } from "@/components/gantt/export-dialog";
import { solairInput } from "@/dev/solair-fixture";
import { autoZoom } from "@/lib/gantt/layout";

/** Development-only: the Solair programme on the Gantt, with the export dialog (no database). */
export default function GanttExportPreview() {
  const [open, setOpen] = useState(false);
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <button type="button" className="mb-4 rounded border px-3 py-2" onClick={() => setOpen(true)}>
        Export…
      </button>
      <GanttChart input={solairInput} options={{ zoom: autoZoom(solairInput, "2026-11-22"), colorBy: "status", today: "2026-11-22", showOwners: false }} canEdit={false} />
      <ExportDialog
        open={open}
        onClose={() => setOpen(false)}
        project={{ name: "OG5376 - Solair Apartments", code: "OG5376", client_id: null, client: null }}
        input={solairInput}
        defaultColorBy="status"
      />
    </main>
  );
}
