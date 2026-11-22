"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { C, GanttLabels, GanttTimeline } from "@/components/gantt/gantt-svg";
import { HEADER_HEIGHT, layoutGantt, type ColorBy, type GanttInput, type GanttLayout, type Zoom } from "./layout";

export type ExportFormat = "pdf" | "png";
export type Paper = "a4" | "a3";
export type ExportOptions = { format: ExportFormat; paper: Paper; zoom: Zoom; colorBy: ColorBy; showOwners: boolean; today: string };
export type ExportMeta = {
  projectName: string;
  clientName?: string | null;
  code?: string | null;
  generatedOn: string;
  orionLogo?: string | null; // data URL
  clientLogo?: string | null; // data URL
};

const PAPER_PT: Record<Paper, [number, number]> = { a4: [842, 595], a3: [1191, 842] };
const MARGIN_PT = 24;
const PAD = 20;
const TITLE_H = 124;
/** PDF readers all have Helvetica built in; other fonts would fall back to Times. */
const EXPORT_FONT = "helvetica, sans-serif";
const LEGEND_H = 52;
const LABEL_W = 280;

/** Loads any image (PNG/JPG/SVG/WebP) and returns a PNG data URL, so it embeds cleanly in SVG, PNG and PDF. */
export async function imageToPngDataUrl(url: string, maxHeight = 160): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blobUrl = URL.createObjectURL(await res.blob());
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image"));
      img.src = blobUrl;
    });
    const scale = Math.min(1, maxHeight / (img.naturalHeight || maxHeight));
    const w = Math.max(1, Math.round((img.naturalWidth || maxHeight) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || maxHeight) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(blobUrl);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

type Page = { y0: number; y1: number; index: number; total: number };

function ExportSvg({
  layout,
  meta,
  page,
  showOwners,
  logoSizes,
}: {
  layout: GanttLayout;
  meta: ExportMeta;
  page: Page;
  showOwners: boolean;
  logoSizes: { orion?: { w: number; h: number }; client?: { w: number; h: number } };
}) {
  const chartW = LABEL_W + layout.width;
  const bodyH = page.y1 - page.y0;
  const chartH = HEADER_HEIGHT + bodyH;
  const W = chartW + PAD * 2;
  const H = TITLE_H + chartH + LEGEND_H + PAD;
  const chartTop = TITLE_H;
  const shift = page.y0 - HEADER_HEIGHT; // body rows move up by this much
  const orionH = 34;
  const orionW = logoSizes.orion ? (logoSizes.orion.w / logoSizes.orion.h) * orionH : 0;
  const clientH = 44;
  const clientW = logoSizes.client ? Math.min(180, (logoSizes.client.w / logoSizes.client.h) * clientH) : 0;
  const subtitle = [meta.clientName, meta.code, `Generated ${meta.generatedOn}`].filter(Boolean).join("  ·  ");
  const legendItems = layout.legend;

  const chart = (clipId: string, clipY: number, clipH: number, dy: number) => (
    <g clipPath={`url(#${clipId})`}>
      <g transform={`translate(0, ${-dy})`}>
        <GanttLabels layout={layout} width={LABEL_W} showOwners={showOwners} fontFamily={EXPORT_FONT} />
        <g transform={`translate(${LABEL_W}, 0)`}>
          <GanttTimeline layout={layout} fontFamily={EXPORT_FONT} />
        </g>
      </g>
      <clipPath id={clipId}>
        <rect x={0} y={clipY} width={chartW} height={clipH} />
      </clipPath>
    </g>
  );

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} fontFamily={EXPORT_FONT}>
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      {/* Title block */}
      <g transform={`translate(${PAD}, ${PAD})`}>
        {meta.orionLogo && <image href={meta.orionLogo} x={0} y={0} width={orionW} height={orionH} />}
        <text x={0} y={orionH + 28} fontSize={20} fontWeight={700} fill={C.text}>
          {meta.projectName}
        </text>
        <text x={0} y={orionH + 48} fontSize={11.5} fill={C.muted}>
          {subtitle}
          {page.total > 1 ? `  ·  Page ${page.index} of ${page.total}` : ""}
        </text>
        {meta.clientLogo && <image href={meta.clientLogo} x={chartW - clientW} y={0} width={clientW} height={clientH} />}
      </g>

      {/* Chart: header row always visible, then this page's slice of rows */}
      <g transform={`translate(${PAD}, ${chartTop})`}>
        <rect x={0} y={0} width={chartW} height={chartH} fill="#ffffff" stroke={C.grid} />
        {chart(`hdr-${page.index}`, 0, HEADER_HEIGHT, 0)}
        {/* After shifting this page's rows up, they sit right under the header — clip exactly there. */}
        {chart(`body-${page.index}`, HEADER_HEIGHT, bodyH, shift)}
        <line x1={LABEL_W} x2={LABEL_W} y1={0} y2={chartH} stroke={C.grid} />
      </g>

      {/* Legend */}
      <g transform={`translate(${PAD}, ${chartTop + chartH + 22})`} fontSize={11} fill={C.text}>
        {(() => {
          let x = 0;
          const items = [
            ...legendItems.map((l) => ({ kind: "bar" as const, ...l })),
            { kind: "milestone" as const, label: "Milestone", color: "#7c3aed" },
            { kind: "today" as const, label: "Today", color: C.today },
            { kind: "dep" as const, label: "Waits for", color: C.dep },
          ];
          return items.map((it, i) => {
            const startX = x;
            x += 26 + it.label.length * 6.4 + 18;
            return (
              <g key={i} transform={`translate(${startX}, 0)`}>
                {it.kind === "bar" && <rect x={0} y={-9} width={20} height={11} rx={3} fill={it.color} />}
                {it.kind === "milestone" && <path d="M10,-10 L16,-4 L10,2 L4,-4 Z" fill={it.color} />}
                {it.kind === "today" && <line x1={10} x2={10} y1={-11} y2={3} stroke={it.color} strokeWidth={2} />}
                {it.kind === "dep" && <path d="M1,-4 H17 M13,-8 L18,-4 L13,0" stroke={it.color} strokeWidth={1.5} fill="none" />}
                <text x={26} y={0}>
                  {it.label}
                </text>
              </g>
            );
          });
        })()}
      </g>
    </svg>
  );
}

function renderToSvgString(node: React.ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(node));
  const html = host.innerHTML;
  root.unmount();
  return html;
}

/** Splits task rows into pages that fit the paper (PDF), or one tall page (PNG). */
function paginate(layout: GanttLayout, availableBodyH: number | null): Page[] {
  const body = layout.rows;
  const start = body.length ? body[0].y : HEADER_HEIGHT;
  const end = layout.height;
  if (availableBodyH === null || end - start <= availableBodyH) return [{ y0: start, y1: end, index: 1, total: 1 }];
  const pages: { y0: number; y1: number }[] = [];
  let y0 = start;
  let y1 = start;
  for (const r of body) {
    if (r.y + r.height - y0 > availableBodyH && y1 > y0) {
      pages.push({ y0, y1 });
      y0 = r.y;
    }
    y1 = r.y + r.height;
  }
  pages.push({ y0, y1 });
  return pages.map((p, i) => ({ ...p, index: i + 1, total: pages.length }));
}

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";

export async function exportGantt(input: GanttInput, opts: ExportOptions, meta: ExportMeta) {
  const layout = layoutGantt(input, { zoom: opts.zoom, colorBy: opts.colorBy, today: opts.today });
  const logoSizes = {
    orion: meta.orionLogo ? await imageSize(meta.orionLogo) : undefined,
    client: meta.clientLogo ? await imageSize(meta.clientLogo) : undefined,
  };
  const totalW = LABEL_W + layout.width + PAD * 2;
  const filename = `${slug(meta.projectName)}-gantt-${opts.today}`;

  if (opts.format === "png") {
    const [page] = paginate(layout, null);
    const svg = renderToSvgString(<ExportSvg layout={layout} meta={meta} page={page} showOwners={opts.showOwners} logoSizes={logoSizes} />);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not draw the chart"));
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("Could not create the image");
    download(blob, `${filename}.png`);
    return;
  }

  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const [pw, ph] = PAPER_PT[opts.paper];
  const scale = (pw - MARGIN_PT * 2) / totalW;
  const availableBodyH = (ph - MARGIN_PT * 2) / scale - TITLE_H - HEADER_HEIGHT - LEGEND_H - PAD;
  const pages = paginate(layout, Math.max(availableBodyH, 120));
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: opts.paper });
  doc.setProperties({ title: `${meta.projectName} – Gantt chart`, creator: "Orion Projects" });

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;";
  document.body.appendChild(host);
  try {
    for (const [i, page] of pages.entries()) {
      if (i > 0) doc.addPage();
      host.innerHTML = renderToSvgString(<ExportSvg layout={layout} meta={meta} page={page} showOwners={opts.showOwners} logoSizes={logoSizes} />);
      const el = host.querySelector("svg")!;
      const w = Number(el.getAttribute("width"));
      const h = Number(el.getAttribute("height"));
      await svg2pdf(el, doc, { x: MARGIN_PT, y: MARGIN_PT, width: w * scale, height: h * scale });
    }
  } finally {
    host.remove();
  }
  doc.save(`${filename}.pdf`);
}
