"use client";

import { Download, FileImage, FileText, Loader2, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getClientLogoUrl } from "@/app/(app)/projects/gantt-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { todayISO } from "@/lib/board";
import {
  exportGantt,
  ExportSvg,
  imageSize,
  imageToPngDataUrl,
  layoutFor,
  MARGIN_PT,
  PAPER_LABEL,
  planPageCount,
  planPdf,
  svgSize,
  wholePage,
  type ExportMeta,
  type ExportOptions,
  type FitMode,
  type LogoSizes,
  type NameWidth,
  type Orientation,
  type Paper,
  type TextSize,
} from "@/lib/gantt/export";
import { shiftDate, type ColorBy, type GanttInput, type Zoom } from "@/lib/gantt/layout";
import { cn, formatDate } from "@/lib/utils";
import type { Project } from "@/types/board";

// ---------------------------------------------------------------------------
// Settings, remembered on this device (dates and groups are per export)
// ---------------------------------------------------------------------------
type Saved = Omit<ExportOptions, "today" | "range" | "groupIds">;
const KEY = "orion-gantt-export";
const DEFAULTS: Saved = {
  format: "pdf",
  paper: "a3",
  orientation: "landscape",
  fit: "width",
  across: 2,
  down: 1,
  zoom: "auto",
  colorBy: "status",
  textSize: "normal",
  nameWidth: "normal",
  showOwners: false,
  showTitle: true,
  showLegend: true,
  showToday: true,
  showDeps: true,
  showMilestones: true,
  showPct: true,
  hideDone: false,
  pngScale: 2,
};
function loadSaved(colorBy: ColorBy): Saved {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS, colorBy };
}
const save = (s: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
};

type RangeChoice = "all" | "next1" | "next3" | "next6" | "custom";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function Chips<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-10 rounded-lg border px-3 text-sm font-medium", value === o.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Live preview
// ---------------------------------------------------------------------------
function Preview({ input, o, meta, logoSizes }: { input: GanttInput; o: ExportOptions; meta: ExportMeta; logoSizes: LogoSizes }) {
  const layout = useMemo(() => layoutFor(input, o), [input, o]);
  const empty = !layout.rows.some((r) => r.kind === "task");
  if (o.format === "png") {
    const page = wholePage(layout);
    const s = svgSize(layout, page, o);
    return (
      <div className="grid gap-1">
        <div className="max-h-80 overflow-auto rounded-lg border bg-white">
          <div style={{ aspectRatio: `${s.w} / ${s.h}` }} className="w-full">
            <ExportSvg layout={layout} meta={meta} page={page} look={o} logoSizes={logoSizes} idPrefix="pv" fluid />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          One image · about {Math.round(s.w * o.pngScale)} × {Math.round(s.h * o.pngScale)} pixels{empty ? " · no tasks match" : ""}
        </p>
      </div>
    );
  }
  const plan = planPdf(layout, o);
  const [pw, ph] = plan.paper;
  const count = planPageCount(plan);
  const label = `${count} ${count === 1 ? "page" : "pages"} · ${PAPER_LABEL[o.paper]} ${o.orientation}`;
  if (plan.kind === "sheets") {
    const availW = pw - MARGIN_PT * 2;
    const availH = ph - MARGIN_PT * 2;
    const totalW = availW * plan.across + MARGIN_PT * 2;
    const totalH = availH * plan.down + MARGIN_PT * 2;
    const s = svgSize(layout, plan.page, o);
    return (
      <div className="grid gap-1">
        <div className="relative w-full overflow-hidden rounded-lg border bg-white shadow-sm" style={{ aspectRatio: `${totalW} / ${totalH}` }}>
          <div className="absolute" style={{ left: `${(MARGIN_PT / totalW) * 100}%`, top: `${(MARGIN_PT / totalH) * 100}%`, width: `${((s.w * plan.scale) / totalW) * 100}%` }}>
            <div style={{ aspectRatio: `${s.w} / ${s.h}` }}>
              <ExportSvg layout={layout} meta={meta} page={plan.page} look={o} logoSizes={logoSizes} idPrefix="pv" fluid />
            </div>
          </div>
          {Array.from({ length: plan.across - 1 }, (_, i) => (
            <div key={`v${i}`} className="absolute inset-y-0 border-l-2 border-dashed border-primary/60" style={{ left: `${((MARGIN_PT + (i + 1) * availW) / totalW) * 100}%` }} />
          ))}
          {Array.from({ length: plan.down - 1 }, (_, i) => (
            <div key={`h${i}`} className="absolute inset-x-0 border-t-2 border-dashed border-primary/60" style={{ top: `${((MARGIN_PT + (i + 1) * availH) / totalH) * 100}%` }} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {label} — dashed lines show where the sheets join{empty ? " · no tasks match" : ""}
        </p>
      </div>
    );
  }
  const page = plan.pages[0];
  const s = svgSize(layout, page, o);
  const x = o.fit === "one" ? (pw - s.w * plan.scale) / 2 : MARGIN_PT;
  return (
    <div className="grid gap-1">
      <div className="mx-auto w-full" style={{ maxWidth: o.orientation === "portrait" ? 300 : undefined }}>
        <div className="relative w-full overflow-hidden rounded-lg border bg-white shadow-sm" style={{ aspectRatio: `${pw} / ${ph}` }}>
          <div className="absolute" style={{ left: `${(x / pw) * 100}%`, top: `${(MARGIN_PT / ph) * 100}%`, width: `${((s.w * plan.scale) / pw) * 100}%` }}>
            <div style={{ aspectRatio: `${s.w} / ${s.h}` }}>
              <ExportSvg layout={layout} meta={meta} page={page} look={o} logoSizes={logoSizes} idPrefix="pv" fluid />
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {label}
        {count > 1 ? " — showing page 1" : ""}
        {empty ? " · no tasks match" : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------
export function ExportDialog({
  open,
  onClose,
  project,
  input,
  defaultColorBy,
}: {
  open: boolean;
  onClose: () => void;
  project: Pick<Project, "name" | "code" | "client_id" | "client">;
  input: GanttInput;
  defaultColorBy: ColorBy;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && <ExportForm project={project} input={input} defaultColorBy={defaultColorBy} onClose={onClose} />}
    </Dialog>
  );
}

function ExportForm({ project, input, defaultColorBy, onClose }: { project: Pick<Project, "name" | "code" | "client_id" | "client">; input: GanttInput; defaultColorBy: ColorBy; onClose: () => void }) {
  const today = todayISO();
  const [s, setS] = useState<Saved>(() => loadSaved(defaultColorBy));
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) =>
    setS((prev) => {
      const next = { ...prev, [k]: v };
      save(next);
      return next;
    });
  const [rangeChoice, setRangeChoice] = useState<RangeChoice>("all");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(shiftDate(today, 90));
  const [groupIds, setGroupIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const [logos, setLogos] = useState<{ orion: string | null; client: string | null }>({ orion: null, client: null });
  const [logoSizes, setLogoSizes] = useState<LogoSizes>({});

  // Logos for the title (also in the preview).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [orion, client] = await Promise.all([
        imageToPngDataUrl("/brand/orion-logo.png"),
        project.client_id ? getClientLogoUrl(project.client_id).then((r) => (r.ok && r.data?.url ? imageToPngDataUrl(r.data.url) : null)).catch(() => null) : Promise.resolve(null),
      ]);
      const sizes: LogoSizes = { orion: orion ? await imageSize(orion) : undefined, client: client ? await imageSize(client) : undefined };
      if (alive) {
        setLogos({ orion, client });
        setLogoSizes(sizes);
      }
    })();
    return () => {
      alive = false;
    };
  }, [project.client_id]);

  const range = useMemo(() => {
    if (rangeChoice === "all") return null;
    if (rangeChoice === "custom") return from && to && to >= from ? { start: from, end: to } : null;
    const months = rangeChoice === "next1" ? 1 : rangeChoice === "next3" ? 3 : 6;
    return { start: today, end: shiftDate(today, months * 30) };
  }, [rangeChoice, from, to, today]);

  const opts: ExportOptions = useMemo(() => ({ ...s, today, range, groupIds }), [s, today, range, groupIds]);
  const meta: ExportMeta = useMemo(
    () => ({ projectName: project.name, clientName: project.client?.name, code: project.code, generatedOn: formatDate(new Date()), orionLogo: logos.orion, clientLogo: logos.client }),
    [project, logos],
  );
  const groupsWithTasks = input.groups.filter((g) => input.tasks.some((t) => t.group_id === g.id));
  const selected = groupIds ?? groupsWithTasks.map((g) => g.id);

  async function run(action: "download" | "print") {
    // Printing: open the window now (phones block windows opened after waiting).
    const win = action === "print" ? window.open("", "_blank") : null;
    if (win) win.document.write("<p style='font-family:sans-serif;padding:24px'>Preparing the Gantt chart…</p>");
    setBusy(action);
    try {
      const blob = await exportGantt(input, opts, meta, action);
      if (action === "print") {
        const url = URL.createObjectURL(blob);
        if (win) win.location.href = url;
        else window.location.href = url;
        toast.success("Opened for printing");
      } else {
        toast.success(s.format === "pdf" ? "PDF downloaded" : "Image downloaded");
      }
      onClose();
    } catch (e) {
      console.error(e);
      win?.close();
      toast.error("Sorry, the export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const isPdf = s.format === "pdf";
  return (
    <DialogContent title="Export or print the Gantt chart" description="Choose what to include and how it fits on the paper. The preview updates as you go; your choices are remembered on this device." className="max-w-3xl">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <Section title="File">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="File type">
              {(
                [
                  ["pdf", FileText, "PDF (print, email)"],
                  ["png", FileImage, "PNG image"],
                ] as const
              ).map(([f, Icon, label]) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={s.format === f}
                  onClick={() => set("format", f)}
                  className={cn("flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold", s.format === f ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}
                >
                  <Icon className="size-4" aria-hidden /> {label}
                </button>
              ))}
            </div>
            {!isPdf && (
              <Chips<2 | 3>
                label="Image sharpness"
                value={s.pngScale}
                onChange={(v) => set("pngScale", v)}
                options={[
                  { value: 2, label: "Sharp" },
                  { value: 3, label: "Extra sharp (bigger file)" },
                ]}
              />
            )}
          </Section>

          {isPdf && (
            <Section title="Paper and fit">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Paper
                  <NativeSelect value={s.paper} onChange={(e) => set("paper", e.target.value as Paper)}>
                    <option value="a4">A4</option>
                    <option value="a3">A3</option>
                    <option value="a2">A2 (plotter / print shop)</option>
                    <option value="a1">A1 (plotter / print shop)</option>
                    <option value="letter">Letter</option>
                  </NativeSelect>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Orientation
                  <NativeSelect value={s.orientation} onChange={(e) => set("orientation", e.target.value as Orientation)}>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </NativeSelect>
                </label>
              </div>
              <div className="grid gap-1.5" role="radiogroup" aria-label="Fit to page">
                {(
                  [
                    ["one", "Whole chart on 1 page", "Everything shrinks to fit one sheet."],
                    ["width", "Fit the width, more pages down", "Bigger and easier to read; rows continue on the next pages."],
                    ["sheets", "Custom: sheets across × down", "A poster split over several sheets to join together."],
                  ] as [FitMode, string, string][]
                ).map(([f, label, hint]) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={s.fit === f}
                    onClick={() => set("fit", f)}
                    className={cn("grid rounded-xl border px-3 py-2 text-left", s.fit === f ? "border-primary bg-primary/10" : "hover:bg-accent")}
                  >
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
              {s.fit === "sheets" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Sheets across
                    <NativeSelect value={s.across} onChange={(e) => set("across", Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Sheets down
                    <NativeSelect value={s.down} onChange={(e) => set("down", Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                </div>
              )}
            </Section>
          )}

          <Section title="Dates">
            <NativeSelect aria-label="Which dates" value={rangeChoice} onChange={(e) => setRangeChoice(e.target.value as RangeChoice)}>
              <option value="all">Whole project</option>
              <option value="next1">Next month (from today)</option>
              <option value="next3">Next 3 months</option>
              <option value="next6">Next 6 months</option>
              <option value="custom">From – to…</option>
            </NativeSelect>
            {rangeChoice === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                  From
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                  To
                  <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                </label>
              </div>
            )}
            <label className="grid gap-1 text-xs text-muted-foreground">
              Timeline in
              <NativeSelect value={s.zoom} onChange={(e) => set("zoom", e.target.value as Zoom | "auto")}>
                <option value="auto">Best fit</option>
                <option value="day">Days</option>
                <option value="week">Weeks</option>
                <option value="month">Months</option>
              </NativeSelect>
            </label>
          </Section>

          <Section title="Tasks">
            {groupsWithTasks.length > 1 && (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Groups ({selected.length} of {groupsWithTasks.length})</span>
                  <button type="button" className="h-8 font-medium text-primary" onClick={() => setGroupIds(groupIds === null ? [] : null)}>
                    {groupIds === null ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {groupsWithTasks.map((g) => {
                    const on = selected.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const next = on ? selected.filter((id) => id !== g.id) : [...selected, g.id];
                          setGroupIds(next.length === groupsWithTasks.length ? null : next);
                        }}
                        className={cn("inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm", on ? "border-primary bg-primary/10 font-medium" : "bg-card text-muted-foreground")}
                      >
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
                        <span className="truncate">{g.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <Toggle label="Leave out finished tasks" checked={s.hideDone} onChange={(v) => set("hideDone", v)} />
            <Toggle label="Show who is working on each task" hint="Internal tasks and notes are never included." checked={s.showOwners} onChange={(v) => set("showOwners", v)} />
          </Section>

          <Section title="Look">
            <div className="grid gap-1 text-xs text-muted-foreground">
              Text size
              <Chips<TextSize>
                label="Text size"
                value={s.textSize}
                onChange={(v) => set("textSize", v)}
                options={[
                  { value: "small", label: "Small" },
                  { value: "normal", label: "Normal" },
                  { value: "large", label: "Large" },
                ]}
              />
              <span>Larger text makes the timeline more compact.</span>
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground">
              Task name column
              <Chips<NameWidth>
                label="Task name column"
                value={s.nameWidth}
                onChange={(v) => set("nameWidth", v)}
                options={[
                  { value: "narrow", label: "Narrow" },
                  { value: "normal", label: "Normal" },
                  { value: "wide", label: "Wide (long names)" },
                ]}
              />
            </div>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Colour bars by
              <NativeSelect value={s.colorBy} onChange={(e) => set("colorBy", e.target.value as ColorBy)}>
                <option value="status">Status</option>
                <option value="group">Group</option>
              </NativeSelect>
            </label>
            <Toggle label="Title, logos and date" checked={s.showTitle} onChange={(v) => set("showTitle", v)} />
            <Toggle label="Legend" checked={s.showLegend} onChange={(v) => set("showLegend", v)} />
            <Toggle label="% complete column" checked={s.showPct} onChange={(v) => set("showPct", v)} />
            <Toggle label="Milestones" checked={s.showMilestones} onChange={(v) => set("showMilestones", v)} />
            <Toggle label="Today line" checked={s.showToday} onChange={(v) => set("showToday", v)} />
            <Toggle label="“Waits for” arrows" checked={s.showDeps} onChange={(v) => set("showDeps", v)} />
          </Section>
        </div>

        <div className="order-first grid content-start gap-3 md:sticky md:top-0 md:order-none">
          <Section title="Preview">
            <Preview input={input} o={opts} meta={meta} logoSizes={logoSizes} />
          </Section>
          <div className="grid gap-2">
            {isPdf && (
              <Button variant="outline" onClick={() => run("print")} disabled={!!busy}>
                {busy === "print" ? <Loader2 className="animate-spin" aria-hidden /> : <Printer aria-hidden />} Print
              </Button>
            )}
            <Button onClick={() => run("download")} disabled={!!busy}>
              {busy === "download" ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} {busy === "download" ? "Preparing…" : `Download ${isPdf ? "PDF" : "image"}`}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={!!busy}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
