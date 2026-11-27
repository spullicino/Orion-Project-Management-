"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { C, GanttLabels, GanttTimeline } from "@/components/gantt/gantt-svg";
import { DAY_WIDTH, HEADER_HEIGHT, layoutGantt, daysBetween, taskSpan, type ColorBy, type GanttInput, type GanttLayout, type Zoom } from "./layout";

export type ExportFormat = "pdf" | "png";
export type Paper = "a4" | "a3" | "a2" | "a1" | "letter";
export type Orientation = "landscape" | "portrait";
/** one: everything on one sheet · width: fit the width, rows continue on more pages · sheets: N across × M down (a poster). */
export type FitMode = "one" | "width" | "sheets";
export type TextSize = "small" | "normal" | "large";
export type NameWidth = "narrow" | "normal" | "wide";

export type ExportOptions = {
  format: ExportFormat;
  paper: Paper;
  orientation: Orientation;
  fit: FitMode;
  across: number;
  down: number;
  zoom: Zoom | "auto";
  colorBy: ColorBy;
  today: string;
  textSize: TextSize;
  nameWidth: NameWidth;
  showOwners: boolean;
  showTitle: boolean;
  showLegend: boolean;
  showToday: boolean;
  showDeps: boolean;
  showMilestones: boolean;
  showPct: boolean;
  /** Only these dates (null = the whole project). */
  range: { start: string; end: string } | null;
  /** Only these groups (null = all). */
  groupIds: string[] | null;
  hideDone: boolean;
  /** PNG sharpness. */
  pngScale: 2 | 3;
};

export type ExportMeta = {
  projectName: string;
  clientName?: string | null;
  code?: string | null;
  generatedOn: string;
  orionLogo?: string | null; // data URL
  clientLogo?: string | null; // data URL
};

export const PAPER_LABEL: Record<Paper, string> = { a4: "A4", a3: "A3", a2: "A2", a1: "A1", letter: "Letter" };
/** Landscape size in PDF points. */
const PAPER_PT: Record<Paper, [number, number]> = { a4: [842, 595], a3: [1191, 842], a2: [1684, 1191], a1: [2384, 1684], letter: [792, 612] };
export const paperSize = (paper: Paper, o: Orientation): [number, number] => {
  const [w, h] = PAPER_PT[paper];
  return o === "landscape" ? [w, h] : [h, w];
};
export const MARGIN_PT = 24;
const PAD = 20;
const TITLE_H = 124;
const TOP_NO_TITLE = 14;
/** PDF readers all have Helvetica built in; other fonts would fall back to Times. */
const EXPORT_FONT = "helvetica, sans-serif";
const LEGEND_H = 52;
const NAME_W: Record<NameWidth, number> = { narrow: 200, normal: 280, wide: 380 };
/** Bigger text = a more compact timeline, so the chart is enlarged more to fill the paper. */
const DENSITY: Record<TextSize, number> = { small: 1.5, normal: 1, large: 0.62 };

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

export function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}
export type LogoSizes = { orion?: { w: number; h: number }; client?: { w: number; h: number } };

// ---------------------------------------------------------------------------
// What goes in: groups, dates, finished tasks
// ---------------------------------------------------------------------------

/** The project's tasks narrowed to the chosen groups and dates (and without finished ones, if asked). */
export function filterInput(input: GanttInput, o: Pick<ExportOptions, "range" | "groupIds" | "hideDone" | "showMilestones">): GanttInput {
  const groups = o.groupIds ? input.groups.filter((g) => o.groupIds!.includes(g.id)) : input.groups;
  const keep = new Set(groups.map((g) => g.id));
  const tasks = input.tasks.filter((t) => {
    if (o.groupIds && !keep.has(t.group_id)) return false;
    if (o.hideDone && t.completed_at) return false;
    if (o.range) {
      const s = taskSpan(t);
      if (s && (s.end < o.range.start || s.start > o.range.end)) return false;
    }
    return true;
  });
  const milestones = !o.showMilestones ? [] : o.range ? input.milestones.filter((m) => m.date >= o.range!.start && m.date <= o.range!.end) : input.milestones;
  return { ...input, groups, tasks, milestones };
}

/** Best timeline unit for the dates shown. */
function bestZoom(input: GanttInput, o: ExportOptions): Zoom {
  let days: number;
  if (o.range) days = daysBetween(o.range.start, o.range.end) + 1;
  else {
    const dates = [o.today, ...input.tasks.flatMap((t) => {
      const s = taskSpan(t);
      return s ? [s.start, s.end] : [];
    }), ...input.milestones.map((m) => m.date)].sort();
    days = daysBetween(dates[0], dates[dates.length - 1]) + 1;
  }
  const target = 1500;
  const f = DENSITY[o.textSize];
  if (days * DAY_WIDTH.day * f <= target) return "day";
  if (days * DAY_WIDTH.week * f <= target) return "week";
  return "month";
}

export function layoutFor(input: GanttInput, o: ExportOptions): GanttLayout {
  const filtered = filterInput(input, o);
  const zoom = o.zoom === "auto" ? bestZoom(filtered, o) : o.zoom;
  const layout = layoutGantt(filtered, { zoom, colorBy: o.colorBy, today: o.today, range: o.range, dayWidthFactor: DENSITY[o.textSize] });
  return { ...layout, deps: o.showDeps ? layout.deps : [], todayX: o.showToday ? layout.todayX : null };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export type Page = { y0: number; y1: number; index: number; total: number };
type Look = Pick<ExportOptions, "showOwners" | "showTitle" | "showLegend" | "showPct" | "nameWidth">;

const topH = (o: Look) => (o.showTitle ? TITLE_H : TOP_NO_TITLE);
const bottomH = (o: Look) => (o.showLegend ? LEGEND_H : PAD);
/** Size of one drawn page (in chart units) for these rows. */
export const svgSize = (layout: GanttLayout, page: Page, o: Look) => ({
  w: NAME_W[o.nameWidth] + layout.width + PAD * 2,
  h: topH(o) + HEADER_HEIGHT + (page.y1 - page.y0) + bottomH(o),
});

export function ExportSvg({
  layout,
  meta,
  page,
  look,
  logoSizes,
  pageLabel,
  idPrefix = "x",
  fluid,
}: {
  layout: GanttLayout;
  meta: ExportMeta;
  page: Page;
  look: Look;
  logoSizes: LogoSizes;
  pageLabel?: string;
  idPrefix?: string;
  /** Fill its box (previews) instead of its natural size. */
  fluid?: boolean;
}) {
  const labelW = NAME_W[look.nameWidth];
  const chartW = labelW + layout.width;
  const bodyH = page.y1 - page.y0;
  const chartH = HEADER_HEIGHT + bodyH;
  const { w: W, h: H } = svgSize(layout, page, look);
  const chartTop = topH(look);
  const shift = page.y0 - HEADER_HEIGHT; // body rows move up by this much
  const orionH = 34;
  const orionW = logoSizes.orion ? (logoSizes.orion.w / logoSizes.orion.h) * orionH : 0;
  const clientH = 44;
  const clientW = logoSizes.client ? Math.min(180, (logoSizes.client.w / logoSizes.client.h) * clientH) : 0;
  const subtitle = [meta.clientName, meta.code, `Generated ${meta.generatedOn}`].filter(Boolean).join("  ·  ");

  const chart = (clipId: string, clipY: number, clipH: number, dy: number) => (
    <g clipPath={`url(#${clipId})`}>
      <g transform={`translate(0, ${-dy})`}>
        <GanttLabels layout={layout} width={labelW} showOwners={look.showOwners} showPct={look.showPct} fontFamily={EXPORT_FONT} />
        <g transform={`translate(${labelW}, 0)`}>
          <GanttTimeline layout={layout} fontFamily={EXPORT_FONT} />
        </g>
      </g>
      <clipPath id={clipId}>
        <rect x={0} y={clipY} width={chartW} height={clipH} />
      </clipPath>
    </g>
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={fluid ? "100%" : W}
      height={fluid ? "100%" : H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMinYMin meet"
      fontFamily={EXPORT_FONT}
      style={fluid ? { display: "block" } : undefined}
    >
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      {look.showTitle && (
        <g transform={`translate(${PAD}, ${PAD})`}>
          {meta.orionLogo && <image href={meta.orionLogo} x={0} y={0} width={orionW} height={orionH} />}
          <text x={0} y={orionH + 28} fontSize={20} fontWeight={700} fill={C.text}>
            {meta.projectName}
          </text>
          <text x={0} y={orionH + 48} fontSize={11.5} fill={C.muted}>
            {subtitle}
            {pageLabel ? `  ·  ${pageLabel}` : page.total > 1 ? `  ·  Page ${page.index} of ${page.total}` : ""}
          </text>
          {meta.clientLogo && <image href={meta.clientLogo} x={chartW - clientW} y={0} width={clientW} height={clientH} />}
        </g>
      )}

      {/* Chart: header row always visible, then this page's slice of rows */}
      <g transform={`translate(${PAD}, ${chartTop})`}>
        <rect x={0} y={0} width={chartW} height={chartH} fill="#ffffff" stroke={C.grid} />
        {chart(`${idPrefix}-hdr-${page.index}`, 0, HEADER_HEIGHT, 0)}
        {chart(`${idPrefix}-body-${page.index}`, HEADER_HEIGHT, bodyH, shift)}
        <line x1={labelW} x2={labelW} y1={0} y2={chartH} stroke={C.grid} />
      </g>

      {look.showLegend && (
        <g transform={`translate(${PAD}, ${chartTop + chartH + 22})`} fontSize={11} fill={C.text}>
          {(() => {
            let x = 0;
            const items = [
              ...layout.legend.map((l) => ({ kind: "bar" as const, ...l })),
              ...(layout.milestones.length ? [{ kind: "milestone" as const, label: "Milestone", color: "#7c3aed" }] : []),
              ...(layout.todayX !== null ? [{ kind: "today" as const, label: "Today", color: C.today }] : []),
              ...(layout.deps.length ? [{ kind: "dep" as const, label: "Waits for", color: C.dep }] : []),
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
      )}
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

/** All rows on one page. */
export function wholePage(layout: GanttLayout): Page {
  const start = layout.rows.length ? layout.rows[0].y : HEADER_HEIGHT;
  return { y0: start, y1: Math.max(layout.height, start), index: 1, total: 1 };
}

/** Splits task rows into pages of at most availableBodyH. */
function paginate(layout: GanttLayout, availableBodyH: number): Page[] {
  const whole = wholePage(layout);
  if (whole.y1 - whole.y0 <= availableBodyH) return [whole];
  const pages: { y0: number; y1: number }[] = [];
  let y0 = whole.y0;
  let y1 = whole.y0;
  for (const r of layout.rows) {
    if (r.y + r.height - y0 > availableBodyH && y1 > y0) {
      pages.push({ y0, y1 });
      y0 = r.y;
    }
    y1 = r.y + r.height;
  }
  pages.push({ y0, y1 });
  return pages.map((p, i) => ({ ...p, index: i + 1, total: pages.length }));
}

// ---------------------------------------------------------------------------
// Page planning (also used by the live preview)
// ---------------------------------------------------------------------------

export type Plan =
  | { kind: "pages"; paper: [number, number]; scale: number; pages: Page[] }
  | { kind: "sheets"; paper: [number, number]; scale: number; page: Page; across: number; down: number };

export function planPdf(layout: GanttLayout, o: ExportOptions): Plan {
  const paper = paperSize(o.paper, o.orientation);
  const availW = paper[0] - MARGIN_PT * 2;
  const availH = paper[1] - MARGIN_PT * 2;
  const whole = wholePage(layout);
  const size = svgSize(layout, whole, o);
  if (o.fit === "one") {
    return { kind: "pages", paper, scale: Math.min(availW / size.w, availH / size.h), pages: [whole] };
  }
  if (o.fit === "sheets") {
    const across = Math.max(1, Math.min(6, o.across));
    const down = Math.max(1, Math.min(6, o.down));
    return { kind: "sheets", paper, scale: Math.min((availW * across) / size.w, (availH * down) / size.h), page: whole, across, down };
  }
  // Fit the width; rows carry on onto more pages.
  const scale = availW / size.w;
  const fixed = topH(o) + HEADER_HEIGHT + bottomH(o);
  return { kind: "pages", paper, scale, pages: paginate(layout, Math.max(availH / scale - fixed, 120)) };
}

export const planPageCount = (p: Plan) => (p.kind === "pages" ? p.pages.length : p.across * p.down);

// ---------------------------------------------------------------------------
// Making the files
// ---------------------------------------------------------------------------

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

async function buildPng(layout: GanttLayout, o: ExportOptions, meta: ExportMeta, logoSizes: LogoSizes): Promise<Blob> {
  const page = wholePage(layout);
  const svg = renderToSvgString(<ExportSvg layout={layout} meta={meta} page={page} look={o} logoSizes={logoSizes} />);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not draw the chart"));
    img.src = url;
  });
  const scale = o.pngScale;
  const canvas = document.createElement("canvas");
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not create the image");
  return blob;
}

async function buildPdf(layout: GanttLayout, o: ExportOptions, meta: ExportMeta, logoSizes: LogoSizes, forPrint: boolean): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const plan = planPdf(layout, o);
  const [pw, ph] = plan.paper;
  const doc = new jsPDF({ orientation: o.orientation, unit: "pt", format: o.paper === "letter" ? "letter" : o.paper });
  doc.setProperties({ title: `${meta.projectName} – Gantt chart`, creator: "Orion Projects" });

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;";
  document.body.appendChild(host);
  const draw = async (node: React.ReactElement, x: number, y: number, scale: number) => {
    host.innerHTML = renderToSvgString(node);
    const el = host.querySelector("svg")!;
    await svg2pdf(el, doc, { x, y, width: Number(el.getAttribute("width")) * scale, height: Number(el.getAttribute("height")) * scale });
  };
  try {
    if (plan.kind === "pages") {
      for (const [i, page] of plan.pages.entries()) {
        if (i > 0) doc.addPage();
        const size = svgSize(layout, page, o);
        // One page: centre it; otherwise top-left like a document.
        const x = o.fit === "one" ? (pw - size.w * plan.scale) / 2 : MARGIN_PT;
        await draw(<ExportSvg layout={layout} meta={meta} page={page} look={o} logoSizes={logoSizes} idPrefix={`p${i}`} />, x, MARGIN_PT, plan.scale);
      }
    } else {
      // A poster: the whole chart, enlarged across several sheets; each sheet shows its part.
      const availW = pw - MARGIN_PT * 2;
      const availH = ph - MARGIN_PT * 2;
      let n = 0;
      for (let r = 0; r < plan.down; r++) {
        for (let c = 0; c < plan.across; c++) {
          if (n++ > 0) doc.addPage();
          await draw(
            <ExportSvg layout={layout} meta={meta} page={plan.page} look={o} logoSizes={logoSizes} idPrefix={`s${r}-${c}`} />,
            MARGIN_PT - c * availW,
            MARGIN_PT - r * availH,
            plan.scale,
          );
          // White margins so each sheet can be trimmed and joined.
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, pw, MARGIN_PT, "F");
          doc.rect(0, ph - MARGIN_PT, pw, MARGIN_PT, "F");
          doc.rect(0, 0, MARGIN_PT, ph, "F");
          doc.rect(pw - MARGIN_PT, 0, MARGIN_PT, ph, "F");
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          doc.text(`${meta.projectName} — sheet ${r + 1}.${c + 1} (row ${r + 1}, column ${c + 1} of ${plan.down} × ${plan.across})`, MARGIN_PT, ph - 9);
        }
      }
    }
  } finally {
    host.remove();
  }
  if (forPrint) doc.autoPrint();
  return doc.output("blob");
}

/**
 * Makes the PDF or PNG. "download" saves it; "print" returns the PDF so it can be
 * opened in a window the caller prepared (opening one after waiting is blocked on iPhones).
 */
export async function exportGantt(input: GanttInput, o: ExportOptions, meta: ExportMeta, action: "download" | "print" = "download"): Promise<Blob> {
  const layout = layoutFor(input, o);
  const logoSizes: LogoSizes = {
    orion: o.showTitle && meta.orionLogo ? await imageSize(meta.orionLogo) : undefined,
    client: o.showTitle && meta.clientLogo ? await imageSize(meta.clientLogo) : undefined,
  };
  const filename = `${slug(meta.projectName)}-gantt-${o.today}`;
  if (o.format === "png") {
    const blob = await buildPng(layout, o, meta, logoSizes);
    if (action === "download") download(blob, `${filename}.png`);
    return blob;
  }
  const blob = await buildPdf(layout, o, meta, logoSizes, action === "print");
  if (action === "download") download(blob, `${filename}.pdf`);
  return blob;
}
