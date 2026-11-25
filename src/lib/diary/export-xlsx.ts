"use client";

import { hoursSummary, updateRows } from "@/lib/diary/export-rows";
import type { DailyUpdate } from "@/types/diary";
import type { SheetData } from "write-excel-file/browser";

/** Downloads an .xlsx with two sheets: every update, and hours per person. */
export async function downloadUpdatesWorkbook(updates: DailyUpdate[], fileName: string) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const rows = updateRows(updates);
  const updatesSheet: SheetData = [
    ["Date", "Person", "Project", "Hours", "Work done", "Issues / delays", "Photos", "Posted at"].map(bold),
    ...rows.map((r) => [
      { value: new Date(`${r.date}T12:00:00Z`), format: "dd/mm/yyyy" },
      { value: r.person },
      { value: r.project },
      r.hours === null ? null : { value: r.hours },
      { value: r.workDone, wrap: true },
      { value: r.issues, wrap: true },
      { value: r.photos },
      { value: r.posted },
    ]),
  ];
  const summary = hoursSummary(updates);
  const total = summary.reduce((n, r) => n + r.hours, 0);
  const hoursSheet: SheetData = [
    ["Person", "Updates", "Days with an update", "Total hours", "Projects"].map(bold),
    ...summary.map((r) => [{ value: r.person }, { value: r.updates }, { value: r.days }, { value: r.hours }, { value: r.projects, wrap: true }]),
    [bold("Total"), { value: rows.length, fontWeight: "bold" as const }, null, { value: Math.round(total * 10) / 10, fontWeight: "bold" as const }, null],
  ];
  await writeXlsxFile(
    [
      { data: updatesSheet, sheet: "Updates", stickyRowsCount: 1, columns: [{ width: 12 }, { width: 22 }, { width: 28 }, { width: 8 }, { width: 70 }, { width: 40 }, { width: 8 }, { width: 10 }] },
      { data: hoursSheet, sheet: "Hours per person", stickyRowsCount: 1, columns: [{ width: 24 }, { width: 10 }, { width: 20 }, { width: 12 }, { width: 50 }] },
    ],
  ).toFile(fileName);
}
