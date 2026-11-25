"use client";

import { notFound } from "next/navigation";
import { ExportUpdatesButton } from "@/components/diary/export-dialog";
import { Button } from "@/components/ui/button";
import type { DailyUpdate } from "@/types/diary";

const P1 = { id: "p1", name: "OG5376 - Solair Apartments", color: "#2563eb" };
const P2 = { id: "p2", name: "OG5698 - Central Bank", color: "#16a34a" };
const u = (id: string, who: [string, string, string], project: typeof P1, date: string, hours: number | null, work: string, issues: string | null = null): DailyUpdate => ({
  id, project_id: project.id, author_id: who[0], work_date: date, work_done: work, hours, issues, created_at: `${date}T15:${id.padStart(2, "0")}:00Z`, updated_at: `${date}T15:00:00Z`,
  project, author: { first_name: who[1], last_name: who[2], email: null }, photos: [],
});
const joe: [string, string, string] = ["j", "Joe", "Vella"];
const mm: [string, string, string] = ["m", "Muhammad", "Mozumder"];
const SAMPLE = [
  u("1", joe, P1, "2026-11-24", 8, "Installed 110mm drainage pipes on level 2 and fixed brackets along the north wall."),
  u("2", mm, P2, "2026-11-24", 7.5, "Second fix electrical, ground floor.", "Waiting for light fittings"),
  u("3", joe, P1, "2026-11-25", 4, "Soil stack and Y junctions."),
  u("4", joe, P2, "2026-11-25", 4, "Moved to Central Bank: cable tray."),
];

/** Development-only preview of Export updates (no database). */
export default function ExportPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Export preview</h1>
      <ExportUpdatesButton today="2026-11-25" projects={[P1, P2]} people={[{ id: "j", name: "Joe Vella" }, { id: "m", name: "Muhammad Mozumder" }]} />
      <div className="flex gap-2">
        <Button variant="outline" onClick={async () => (await import("@/lib/diary/export-xlsx")).downloadUpdatesWorkbook(SAMPLE, "sample.xlsx")}>
          Sample Excel
        </Button>
        <Button
          variant="outline"
          onClick={async () =>
            (await import("@/lib/diary/report")).buildDailyReport(SAMPLE, { projectName: "All projects", from: "2026-11-24", to: "2026-11-25", quality: "standard", title: "Daily updates", showProject: true, includePhotos: false, fileName: "sample.pdf" })
          }
        >
          Sample PDF
        </Button>
      </div>
    </main>
  );
}
