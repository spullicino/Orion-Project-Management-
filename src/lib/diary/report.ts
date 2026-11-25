"use client";

import { imageToPngDataUrl } from "@/lib/gantt/export";
import { sortUpdates } from "@/lib/diary/export-rows";
import { formatDate, fullName } from "@/lib/utils";
import type { DailyUpdate } from "@/types/diary";

export type ReportOptions = {
  projectName: string;
  clientName?: string | null;
  from: string;
  to: string;
  personName?: string | null;
  quality: "standard" | "high";
  /** Exports (Team daily updates → Export updates): */
  title?: string; // default "Daily site report"
  showProject?: boolean; // show the project next to each person (several projects)
  includePhotos?: boolean; // default true
  fileName?: string;
};

/** Loads a JPEG and returns it as a data URL with its size (for jsPDF). */
async function loadJpeg(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    let blob = await res.blob();
    if (blob.type !== "image/jpeg") {
      // Anything that isn't a JPEG (PNG, WebP, SVG…) is redrawn as a JPEG for the PDF.
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((ok, bad) => {
        img.onload = () => ok();
        img.onerror = () => bad(new Error("image"));
        img.src = url;
      });
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || 800;
      c.height = img.naturalHeight || 600;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      blob = (await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85))) ?? blob;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const bmp = await createImageBitmap(blob);
    const size = { w: bmp.width, h: bmp.height };
    bmp.close();
    return { data, ...size };
  } catch {
    return null;
  }
}

/**
 * Builds a client-ready A4 site diary PDF: Orion header, then each day's
 * updates with author, hours, work done, issues and a 3-column photo grid.
 */
export async function buildDailyReport(updates: DailyUpdate[], opts: ReportOptions, onProgress?: (done: number, total: number) => void) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const contentW = W - M * 2;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > H - M - 20) {
      doc.addPage();
      y = M;
    }
  };
  const text = (s: string, size: number, opts2: { bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
    doc.setFont("helvetica", opts2.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts2.color ?? [15, 23, 42]));
    const lines = doc.splitTextToSize(s, contentW) as string[];
    const lh = size * 1.35;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, M, y + size);
      y += lh;
    }
    y += opts2.gap ?? 0;
  };

  // ---- Header
  const logo = await imageToPngDataUrl("/brand/orion-logo.png");
  if (logo) {
    const props = doc.getImageProperties(logo);
    const lh = 30;
    doc.addImage(logo, "PNG", M, y, (props.width / props.height) * lh, lh);
    y += lh + 16;
  }
  const title = opts.title ?? "Daily site report";
  const withPhotos = opts.includePhotos !== false;
  text(title, 20, { bold: true });
  text(opts.projectName, 13, { bold: true, color: [45, 87, 163] });
  const sub = [
    opts.clientName ? `Client: ${opts.clientName}` : null,
    `Period: ${formatDate(opts.from)} – ${formatDate(opts.to)}`,
    opts.personName ? `Person: ${opts.personName}` : null,
    `Generated ${formatDate(new Date())}`,
  ].filter(Boolean);
  text(sub.join("   ·   "), 9.5, { color: [100, 116, 139], gap: 6 });
  const totalHours = updates.reduce((n, u) => n + (u.hours ? Number(u.hours) : 0), 0);
  const photoCount = withPhotos ? updates.reduce((n, u) => n + u.photos.length, 0) : 0;
  const people = new Set(updates.map((u) => u.author_id)).size;
  text(`${updates.length} updates${opts.showProject ? ` · ${people} ${people === 1 ? "person" : "people"}` : ""}${withPhotos ? ` · ${photoCount} photos` : ""}${totalHours ? ` · ${Math.round(totalHours * 10) / 10} hours recorded` : ""}`, 9.5, { color: [100, 116, 139], gap: 10 });
  doc.setDrawColor(2, 181, 239);
  doc.setLineWidth(2);
  doc.line(M, y, W - M, y);
  y += 16;

  if (!updates.length) text("No daily updates were posted in this period.", 11);

  // ---- Days (oldest first reads naturally in a report)
  const ordered = opts.showProject ? sortUpdates(updates) : [...updates].sort((a, b) => (a.work_date + a.created_at).localeCompare(b.work_date + b.created_at));
  let photosDone = 0;
  let currentDay = "";
  for (const u of ordered) {
    if (u.work_date !== currentDay) {
      currentDay = u.work_date;
      ensure(40);
      y += 6;
      doc.setFillColor(241, 245, 249);
      doc.rect(M, y, contentW, 22, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      const label = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${u.work_date}T12:00:00Z`));
      doc.text(label, M + 8, y + 15);
      y += 32;
    }

    ensure(50);
    text(`${fullName(u.author)}${opts.showProject ? `  ·  ${u.project.name}` : ""}${u.hours !== null ? `  ·  ${Number(u.hours)} hours` : ""}`, 10.5, { bold: true });
    text(u.work_done, 10, { gap: 4 });
    if (u.issues) text(`Issues / delays: ${u.issues}`, 10, { color: [180, 83, 9], gap: 4 });

    // Photos: 3 per row, keeping their proportions.
    const cols = 3;
    const gap = 8;
    const cellW = (contentW - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.75;
    for (let i = 0; withPhotos && i < u.photos.length; i += cols) {
      ensure(cellH + gap);
      const row = u.photos.slice(i, i + cols);
      const imgs = await Promise.all(
        row.map((p) => {
          const url = opts.quality === "high" ? (p.full_url ?? p.thumb_url) : (p.thumb_url ?? p.full_url);
          return url ? loadJpeg(url) : Promise.resolve(null);
        }),
      );
      imgs.forEach((img, j) => {
        const x = M + j * (cellW + gap);
        doc.setFillColor(241, 245, 249);
        doc.rect(x, y, cellW, cellH, "F");
        if (!img) return;
        const scale = Math.min(cellW / img.w, cellH / img.h);
        const w = img.w * scale;
        const h = img.h * scale;
        doc.addImage(img.data, "JPEG", x + (cellW - w) / 2, y + (cellH - h) / 2, w, h, undefined, "FAST");
      });
      photosDone += row.length;
      onProgress?.(photosDone, photoCount);
      y += cellH + gap;
    }
    y += 10;
  }

  // ---- Footer with page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${opts.projectName} · ${title}`, M, H - 22);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 22, { align: "right" });
  }

  const slug = opts.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  doc.save(opts.fileName ?? `${slug}-daily-report-${opts.from}-to-${opts.to}.pdf`);
}
