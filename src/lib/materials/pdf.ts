"use client";

import { imageToPngDataUrl } from "@/lib/gantt/export";
import { formatDate, fullName } from "@/lib/utils";
import { MATERIAL_STATUS, type MaterialRequestDetail } from "@/types/materials";

const qty = (n: number) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** A clean A4 PDF of a material request to send to a supplier (no internal comments). */
export async function buildMaterialPdf(r: MaterialRequestDetail) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const contentW = W - M * 2;
  let y = M;
  const ink: [number, number, number] = [15, 23, 42];
  const grey: [number, number, number] = [100, 116, 139];

  const text = (s: string, x: number, size: number, o: { bold?: boolean; color?: [number, number, number]; align?: "left" | "right"; maxW?: number } = {}) => {
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(o.color ?? ink));
    const lines = doc.splitTextToSize(s, o.maxW ?? contentW) as string[];
    lines.forEach((line, i) => doc.text(line, x, y + size + i * size * 1.3, { align: o.align ?? "left" }));
    return lines.length * size * 1.3;
  };
  const newPageIfNeeded = (h: number) => {
    if (y + h > H - M - 24) {
      doc.addPage();
      y = M;
    }
  };

  // Header: logo left, request number right.
  const logo = await imageToPngDataUrl("/brand/orion-logo.png");
  if (logo) {
    const p = doc.getImageProperties(logo);
    doc.addImage(logo, "PNG", M, y, (p.width / p.height) * 30, 30);
  }
  text(`Material request #${r.number}`, W - M, 16, { bold: true, align: "right" });
  y += 22;
  text(`${formatDate(r.created_at)} · ${MATERIAL_STATUS[r.status].label}`, W - M, 9.5, { color: grey, align: "right" });
  y += 30;

  // Details block.
  const rows: [string, string | null][] = [
    ["Project", [r.project.name, r.project.code].filter(Boolean).join(" · ")],
    ["Client", r.project.client],
    ["Requested by", r.requester ? [fullName(r.requester), r.requester.phone].filter(Boolean).join(" · ") : null],
    ["Needed by", r.needed_by ? `${formatDate(r.needed_by)}${r.urgent ? "  (URGENT)" : ""}` : r.urgent ? "URGENT" : null],
    ["Delivery", r.delivery_note],
    ["Supplier", r.supplier],
    ["PO number", r.po_number],
    ["Expected", r.expected_date ? formatDate(r.expected_date) : null],
  ];
  for (const [label, value] of rows) {
    if (!value) continue;
    newPageIfNeeded(18);
    text(label, M, 9.5, { color: grey });
    const h = text(value, M + 110, 10.5, { maxW: contentW - 110 });
    y += Math.max(16, h + 2);
  }
  y += 8;
  doc.setDrawColor(2, 181, 239);
  doc.setLineWidth(2);
  doc.line(M, y, W - M, y);
  y += 14;

  // Items table.
  const cols = { n: M, item: M + 26, qty: W - M - 120, unit: W - M - 60 };
  const header = () => {
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y, contentW, 22, "F");
    y += 4;
    text("#", cols.n + 4, 9.5, { bold: true });
    text("Item", cols.item, 9.5, { bold: true });
    text("Qty", cols.qty + 40, 9.5, { bold: true, align: "right" });
    text("Unit", cols.unit, 9.5, { bold: true });
    y += 22;
  };
  header();
  r.items.forEach((it, i) => {
    const nameLines = (doc.splitTextToSize(it.name + (it.note ? ` — ${it.note}` : ""), cols.qty - cols.item - 10) as string[]).length;
    const rowH = Math.max(20, nameLines * 13 + 7);
    if (y + rowH > H - M - 24) {
      doc.addPage();
      y = M;
      header();
    }
    text(String(i + 1), cols.n + 4, 10, { color: grey });
    text(it.name + (it.note ? ` — ${it.note}` : ""), cols.item, 10, { maxW: cols.qty - cols.item - 10 });
    text(qty(it.quantity), cols.qty + 40, 10, { bold: true, align: "right" });
    text(it.unit, cols.unit, 10);
    y += rowH;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(M, y - 4, W - M, y - 4);
  });

  // Footer.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${r.project.name} · Material request #${r.number}`, M, H - 22);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 22, { align: "right" });
  }
  const slug = r.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  doc.save(`${slug}-material-request-${r.number}.pdf`);
}
