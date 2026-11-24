"use client";

import { notFound } from "next/navigation";
import { GanttChart } from "@/components/gantt/gantt-chart";
import { solairInput } from "@/dev/solair-fixture";
import { autoZoom } from "@/lib/gantt/layout";
import { exportGantt, imageToPngDataUrl, type Paper } from "@/lib/gantt/export";

/** Development-only: the Solair programme on the Gantt, with export buttons (no database). */
export default function GanttExportPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const run = async (format: "pdf" | "png", paper: Paper) =>
    exportGantt(
      solairInput,
      {
        format,
        paper,
        zoom: autoZoom(solairInput, "2026-11-22"),
        colorBy: "status",
        showOwners: false,
        today: "2026-11-22",
      },
      {
        projectName: "Solair",
        code: "OG5376",
        generatedOn: "22/11/2026",
        orionLogo: await imageToPngDataUrl("/brand/orion-logo.png"),
      },
    );
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className="rounded border px-3 py-2"
          onClick={() => void run("pdf", "a4")}
        >
          Export A4 PDF
        </button>
        <button
          type="button"
          className="rounded border px-3 py-2"
          onClick={() => void run("pdf", "a3")}
        >
          Export A3 PDF
        </button>
        <button
          type="button"
          className="rounded border px-3 py-2"
          onClick={() => void run("png", "a4")}
        >
          Export PNG
        </button>
      </div>
      <GanttChart
        input={solairInput}
        options={{
          zoom: "week",
          colorBy: "status",
          today: "2026-11-22",
          showOwners: false,
        }}
        canEdit={false}
        scrollToTodayKey={0}
        onOpenTask={() => {}}
        onChangeDates={() => {}}
      />
    </main>
  );
}
