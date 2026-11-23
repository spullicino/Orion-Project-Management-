"use client";

import { imageToPngDataUrl } from "@/lib/gantt/export";
import { formatDate } from "@/lib/utils";
import type { ReportLine } from "@/types/materials";

export type ReportMeta = { projectName: string; from?: string | null; to?: string | null; category?: string | null };

const qty = (n: number) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
const period = (m: ReportMeta) =>
  m.from && m.to ? `${formatDate(m.from)} – ${formatDate(m.to)}` : m.from ? `From ${formatDate(m.from)}` : m.to ? `Up to ${formatDate(m.to)}` : "All deliveries so far";
const fileName = (m: ReportMeta, ext: string) => `${slug(m.projectName)}-materials-report${m.from ? `-${m.from}` : ""}${m.to ? `-to-${m.to}` : ""}.${ext}`;

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Spreadsheet (CSV) that opens straight in Excel. */
export function reportCsv(lines: ReportLine[]) {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["Product", "Category", "Code", "Unit", "Delivered", "Requested", "In product list", "Requests", "First delivered", "Last delivered"],
    ...lines.map((l) => [
      l.name,
      l.category,
      l.code,
      l.unit,
      Number(l.delivered),
      Number(l.requested),
      l.in_catalogue ? "Yes" : "No",
      l.requests.map((n) => `#${n}`).join(" "),
      l.first_delivered,
      l.last_delivered,
    ]),
  ];
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadReportCsv(lines: ReportLine[], meta: ReportMeta) {
  // The BOM makes Excel read accents and symbols (e.g. m²) correctly.
  download(new Blob(["﻿" + reportCsv(lines)], { type: "text/csv;charset=utf-8" }), fileName(meta, "csv"));
}

export async function downloadReportPdf(lines: ReportLine[], meta: ReportMeta) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;
  const ink: [number, number, number] = [15, 23, 42];
  const grey: [number, number, number] = [100, 116, 139];
  const text = (s: string, x: number, size: number, o: { bold?: boolean; color?: [number, number, number]; align?: "left" | "right"; maxW?: number } = {}) => {
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(o.color ?? ink));
    const ls = doc.splitTextToSize(s, o.maxW ?? W - M * 2) as string[];
    ls.forEach((l, i) => doc.text(l, x, y + size + i * size * 1.3, { align: o.align ?? "left" }));
    return ls.length * size * 1.3;
  };

  const logo = await imageToPngDataUrl("/brand/orion-logo.png");
  if (logo) {
    const p = doc.getImageProperties(logo);
    doc.addImage(logo, "PNG", M, y, (p.width / p.height) * 30, 30);
  }
  y += 44;
  text("Materials report", M, 18, { bold: true });
  y += 24;
  text(meta.projectName, M, 12, { bold: true, color: [45, 87, 163] });
  y += 18;
  text([period(meta), meta.category ? `Category: ${meta.category}` : null, `Generated ${formatDate(new Date())}`].filter(Boolean).join("   ·   "), M, 9.5, { color: grey });
  y += 20;
  doc.setDrawColor(2, 181, 239);
  doc.setLineWidth(2);
  doc.line(M, y, W - M, y);
  y += 12;

  const col = { name: M + 4, cat: M + 250, del: W - M - 150, req: W - M - 80, unit: W - M - 70 };
  const header = () => {
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y, W - M * 2, 22, "F");
    y += 5;
    text("Product", col.name, 9.5, { bold: true });
    text("Category", col.cat, 9.5, { bold: true });
    text("Delivered", col.del, 9.5, { bold: true, align: "right" });
    text("Requested", col.req, 9.5, { bold: true, align: "right" });
    text("Unit", col.unit, 9.5, { bold: true });
    y += 21;
  };
  header();
  if (!lines.length) text("Nothing was delivered in this period.", M, 10.5, { color: grey });
  for (const l of lines) {
    const n = (doc.splitTextToSize(l.name + (l.in_catalogue ? "" : " *"), col.cat - col.name - 10) as string[]).length;
    const rowH = Math.max(20, n * 13 + 7);
    if (y + rowH > H - M - 30) {
      doc.addPage();
      y = M;
      header();
    }
    text(l.name + (l.in_catalogue ? "" : " *"), col.name, 10, { maxW: col.cat - col.name - 10 });
    text(l.category ?? "—", col.cat, 9.5, { color: grey, maxW: col.del - col.cat - 70 });
    text(qty(l.delivered), col.del, 10, { bold: true, align: "right" });
    text(qty(l.requested), col.req, 10, { color: grey, align: "right" });
    text(l.unit, col.unit, 10);
    y += rowH;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(M, y - 4, W - M, y - 4);
  }
  y += 8;
  if (lines.some((l) => !l.in_catalogue)) text("* Typed by hand (not in the product list).", M, 8.5, { color: grey });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${meta.projectName} · Materials report`, M, H - 22);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 22, { align: "right" });
  }
  doc.save(fileName(meta, "pdf"));
}
