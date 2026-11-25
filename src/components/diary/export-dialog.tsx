"use client";

import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getExportData } from "@/app/(app)/daily-update/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { periodRange } from "@/lib/diary/export-rows";
import { cn } from "@/lib/utils";

type Period = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";
const PERIODS: { value: Exclude<Period, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This week" },
  { value: "lastWeek", label: "Last week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Managers and administrators: export daily updates for a period — all their
 * projects or one, everyone or one person — as Excel or PDF.
 */
export function ExportUpdatesButton({ projects, people, today }: { projects: { id: string; name: string }[]; people: { id: string; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("today");
  const [custom, setCustom] = useState({ from: today, to: today });
  const [projectId, setProjectId] = useState("");
  const [person, setPerson] = useState("");
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const range = period === "custom" ? custom : periodRange(period, today);
  const valid = range.from && range.to && range.from <= range.to && range.to <= today;

  const run = async () => {
    setBusy("Collecting updates…");
    try {
      const res = await getExportData({ from: range.from, to: range.to, project_id: projectId || null, author: person || null, photos: format === "pdf" && photos });
      if (!res.ok) return void toast.error(res.error);
      const updates = res.data ?? [];
      if (!updates.length) return void toast.info("No daily updates in this period.");
      const projectName = projects.find((p) => p.id === projectId)?.name ?? "All projects";
      const personName = people.find((p) => p.id === person)?.name ?? null;
      const base = `daily-updates-${slug(projectId ? projectName : "all-projects")}${personName ? `-${slug(personName)}` : ""}-${range.from}${range.to !== range.from ? `-to-${range.to}` : ""}`;
      if (format === "xlsx") {
        setBusy("Making the Excel file…");
        const { downloadUpdatesWorkbook } = await import("@/lib/diary/export-xlsx");
        await downloadUpdatesWorkbook(updates, `${base}.xlsx`);
      } else {
        setBusy("Making the PDF…");
        const { buildDailyReport } = await import("@/lib/diary/report");
        await buildDailyReport(
          updates,
          { projectName, from: range.from, to: range.to, personName, quality: "standard", title: "Daily updates", showProject: !projectId, includePhotos: photos, fileName: `${base}.pdf` },
          (done, total) => setBusy(`Adding photos… ${done} of ${total}`),
        );
      }
      toast.success(`Exported ${updates.length} ${updates.length === 1 ? "update" : "updates"}`);
      setOpen(false);
    } catch {
      toast.error("Couldn't make the file. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download aria-hidden /> Export updates
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent title="Export daily updates" description="Download the updates people posted — as an Excel sheet (with hours per person) or a PDF.">
          <div className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Period</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[...PERIODS, { value: "custom" as const, label: "Choose dates" }].map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={period === p.value}
                    onClick={() => setPeriod(p.value)}
                    className={cn("h-11 rounded-lg border px-2 text-sm font-medium", period === p.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {period === "custom" ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                    From
                    <Input type="date" value={custom.from} max={custom.to || today} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                  </label>
                  <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                    To
                    <Input type="date" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
                  </label>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).formatRange(new Date(`${range.from}T12:00:00Z`), new Date(`${range.to}T12:00:00Z`))}
                </p>
              )}
            </fieldset>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1 text-sm font-medium">
                Project
                <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">All my projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid min-w-0 gap-1 text-sm font-medium">
                Person
                <NativeSelect value={person} onChange={(e) => setPerson(e.target.value)}>
                  <option value="">Everyone</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Format</legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "xlsx" as const, label: "Excel", hint: "Updates + hours", Icon: FileSpreadsheet },
                  { v: "pdf" as const, label: "PDF", hint: "To print or email", Icon: FileText },
                ].map(({ v, label, hint, Icon }) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={format === v}
                    onClick={() => setFormat(v)}
                    className={cn("flex min-h-14 items-center gap-2 rounded-lg border px-3 text-left", format === v ? "border-primary bg-primary/10 ring-2 ring-primary" : "bg-card hover:bg-accent")}
                  >
                    <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              {format === "pdf" && (
                <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                  <span>
                    Include photos
                    <span className="block text-xs text-muted-foreground">Bigger file and slower. Up to 6 months.</span>
                  </span>
                  <Switch checked={photos} onCheckedChange={setPhotos} />
                </label>
              )}
            </fieldset>

            <div className="flex items-center justify-end gap-2">
              {busy && <span className="mr-auto text-sm text-muted-foreground">{busy}</span>}
              <Button variant="outline" onClick={() => setOpen(false)} disabled={!!busy}>
                Cancel
              </Button>
              <Button onClick={() => void run()} disabled={!!busy || !valid}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} Download
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
