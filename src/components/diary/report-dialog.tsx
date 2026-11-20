"use client";

import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getReportData } from "@/app/(app)/daily-update/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { addDays, todayISO } from "@/lib/board";
import { buildDailyReport } from "@/lib/diary/report";
import { fullName } from "@/lib/utils";

type Project = { id: string; name: string; client?: string | null; people: { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[] };

export function ReportButton({ projects, defaultProject }: { projects: Project[]; defaultProject?: string }) {
  const today = todayISO();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(defaultProject ?? projects[0]?.id ?? "");
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [person, setPerson] = useState("");
  const [quality, setQuality] = useState<"standard" | "high">("standard");
  const [busy, setBusy] = useState<string | null>(null);
  const project = projects.find((p) => p.id === projectId);

  async function run() {
    if (!project) return;
    setBusy("Collecting updates…");
    try {
      const res = await getReportData({ project_id: project.id, from, to, author: person || null });
      if (!res.ok) return void toast.error(res.error);
      const personRow = project.people.find((p) => p.user_id === person);
      await buildDailyReport(
        res.data ?? [],
        { projectName: project.name, clientName: project.client, from, to, personName: personRow ? fullName(personRow) : null, quality },
        (d, t) => setBusy(`Adding photos ${d} of ${t}…`),
      );
      toast.success("Report downloaded");
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Sorry, the report couldn't be created. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!projects.length}>
        <FileText aria-hidden /> PDF report
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        {open && (
          <DialogContent title="Daily report for the client" description="A PDF with every daily update in the period — text and photos — ready to email.">
            <div className="grid gap-4">
              <FormField id="r-project" label="Project">
                <NativeSelect value={projectId} onChange={(e) => { setProjectId(e.target.value); setPerson(""); }}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField id="r-from" label="From">
                  <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                </FormField>
                <FormField id="r-to" label="To">
                  <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
                </FormField>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Last 7 days", from: addDays(today, -6) },
                  { label: "Last 30 days", from: addDays(today, -29) },
                  { label: "This month", from: `${today.slice(0, 7)}-01` },
                ].map((r) => (
                  <Button key={r.label} type="button" size="sm" variant="outline" onClick={() => { setFrom(r.from); setTo(today); }}>
                    {r.label}
                  </Button>
                ))}
              </div>
              <FormField id="r-person" label="Person (optional)">
                <NativeSelect value={person} onChange={(e) => setPerson(e.target.value)}>
                  <option value="">Everyone</option>
                  {project?.people.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {fullName(p)}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="r-quality" label="Photo quality" hint="High quality makes a much larger file.">
                <NativeSelect value={quality} onChange={(e) => setQuality(e.target.value as "standard" | "high")}>
                  <option value="standard">Standard (smaller file, good for email)</option>
                  <option value="high">High (for printing)</option>
                </NativeSelect>
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={!!busy}>
                  Cancel
                </Button>
                <Button onClick={run} disabled={!!busy || !project}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
                  {busy ? "Working…" : "Create PDF"}
                </Button>
              </div>
              {busy && <p className="text-center text-sm text-muted-foreground" aria-live="polite">{busy}</p>}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
