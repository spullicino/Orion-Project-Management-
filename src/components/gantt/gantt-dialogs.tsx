"use client";

import { Check, Copy, Download, Link2, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createShareLink, deleteMilestone, getClientLogoUrl, listShareLinks, revokeShareLink, saveMilestone, type ShareLink } from "@/app/(app)/projects/gantt-actions";
import { ColorPicker } from "@/components/projects/color-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { todayISO } from "@/lib/board";
import { exportGantt, imageToPngDataUrl, type ExportFormat, type Paper } from "@/lib/gantt/export";
import { autoZoom, type ColorBy, type GanttInput, type Zoom } from "@/lib/gantt/layout";
import { formatDate } from "@/lib/utils";
import type { Milestone, Project } from "@/types/board";

// ---------------------------------------------------------------------------
// Milestone add / edit
// ---------------------------------------------------------------------------

export function MilestoneDialog({ projectId, milestone, open, onClose }: { projectId: string; milestone: Milestone | null; open: boolean; onClose: () => void }) {
  const [color, setColor] = useState(milestone?.color ?? "#7c3aed");
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent title={milestone ? "Edit milestone" : "Add a milestone"} description="Milestones are key dates, shown as diamonds on the Gantt chart.">
          <form
            className="grid gap-4"
            action={(form) =>
              start(async () => {
                const res = await saveMilestone(projectId, milestone?.id ?? null, { title: form.get("title"), date: form.get("date"), color, description: form.get("description") });
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.message ?? "Saved");
                onClose();
              })
            }
          >
            <FormField id="ms-title" label="Name">
              <Input name="title" defaultValue={milestone?.title} required maxLength={160} placeholder="e.g. Client walkthrough" />
            </FormField>
            <FormField id="ms-date" label="Date">
              <Input name="date" type="date" defaultValue={milestone?.date ?? todayISO()} required />
            </FormField>
            <FormField id="ms-desc" label="Note (optional)">
              <Input name="description" defaultValue={milestone?.description ?? ""} maxLength={4000} />
            </FormField>
            <div className="grid gap-2">
              <Label>Colour</Label>
              <ColorPicker value={color} onChange={setColor} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />} Save
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {milestone && (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={async () => {
                    if (!(await confirm(`Delete “${milestone.title}”?`))) return;
                    const res = await deleteMilestone(projectId, milestone.id);
                    if (!res.ok) return void toast.error(res.error);
                    toast.success("Milestone deleted");
                    onClose();
                  }}
                >
                  <Trash2 aria-hidden /> Delete
                </Button>
              )}
            </div>
          </form>
          {dialog}
        </DialogContent>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Export PDF / PNG
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
  project: Project;
  input: GanttInput;
  defaultColorBy: ColorBy;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [paper, setPaper] = useState<Paper>("a4");
  const [zoom, setZoom] = useState<Zoom | "auto">("auto");
  const [colorBy, setColorBy] = useState<ColorBy>(defaultColorBy);
  const [showOwners, setShowOwners] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const today = todayISO();
      const [orionLogo, clientLogo] = await Promise.all([
        imageToPngDataUrl("/brand/orion-logo.png"),
        project.client_id
          ? getClientLogoUrl(project.client_id).then((r) => (r.ok && r.data?.url ? imageToPngDataUrl(r.data.url) : null))
          : Promise.resolve(null),
      ]);
      await exportGantt(
        input,
        { format, paper, zoom: zoom === "auto" ? autoZoom(input, today) : zoom, colorBy, showOwners, today },
        { projectName: project.name, clientName: project.client?.name, code: project.code, generatedOn: formatDate(new Date()), orionLogo, clientLogo },
      );
      toast.success(format === "pdf" ? "PDF downloaded" : "Image downloaded");
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Sorry, the export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      {open && (
        <DialogContent title="Export for the client" description="A clean Gantt chart with the Orion logo, project and client name, today's date and a legend.">
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="File type">
              {(["pdf", "png"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={format === f}
                  onClick={() => setFormat(f)}
                  className={`h-14 rounded-xl border text-sm font-semibold ${format === f ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}
                >
                  {f === "pdf" ? "PDF document" : "PNG image"}
                </button>
              ))}
            </div>
            {format === "pdf" && (
              <FormField id="paper" label="Paper size (landscape)">
                <NativeSelect value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
                  <option value="a4">A4</option>
                  <option value="a3">A3 (bigger, easier to read)</option>
                </NativeSelect>
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField id="ex-zoom" label="Scale">
                <NativeSelect value={zoom} onChange={(e) => setZoom(e.target.value as Zoom | "auto")}>
                  <option value="auto">Best fit</option>
                  <option value="day">Days</option>
                  <option value="week">Weeks</option>
                  <option value="month">Months</option>
                </NativeSelect>
              </FormField>
              <FormField id="ex-color" label="Colour bars by">
                <NativeSelect value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
                  <option value="status">Status</option>
                  <option value="group">Group</option>
                </NativeSelect>
              </FormField>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <span>
                <span className="block text-sm font-medium">Show who is working on each task</span>
                <span className="block text-xs text-muted-foreground">Off = internal details hidden (owners). Internal notes are never included.</span>
              </span>
              <Switch checked={showOwners} onCheckedChange={setShowOwners} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={run} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                {busy ? "Preparing…" : "Download"}
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Client share links
// ---------------------------------------------------------------------------

function linkState(l: ShareLink) {
  if (l.revoked_at) return { label: "Turned off", variant: "secondary" as const };
  if (l.expires_at && new Date(l.expires_at) < new Date()) return { label: "Expired", variant: "secondary" as const };
  return { label: "Active", variant: "success" as const };
}

export function ShareDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("90");
  const [showOwners, setShowOwners] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (!open) return;
    void listShareLinks(projectId).then((r) => (r.ok ? setLinks(r.data ?? []) : toast.error(r.error)));
  }, [open, projectId]);

  const urlFor = (token: string) => `${window.location.origin}/share/${token}`;
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      setCopied(token);
      toast.success("Link copied. Paste it into an email or WhatsApp.");
      setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this link:", urlFor(token));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent
          className="max-w-lg"
          title="Share with the client"
          description="Anyone with the link can view a read-only timeline and progress summary — no login needed. You can turn a link off at any time."
        >
          <form
            className="grid gap-3 rounded-xl border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await createShareLink({ project_id: projectId, label, expires_in_days: Number(days), hide_owners: !showOwners });
                if (!res.ok || !res.data) return void toast.error(res.ok ? "Failed" : res.error);
                setLinks((l) => [res.data!, ...(l ?? [])]);
                setLabel("");
                void copy(res.data.token);
              });
            }}
          >
            <FormField id="sl-label" label="Who is it for? (optional)">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Claire at Harbour Holdings" maxLength={120} />
            </FormField>
            <FormField id="sl-exp" label="Link works for">
              <NativeSelect value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">6 months</option>
                <option value="365">1 year</option>
                <option value="0">Until I turn it off</option>
              </NativeSelect>
            </FormField>
            <label className="flex items-center justify-between gap-3 text-sm">
              Show who is working on each task
              <Switch checked={showOwners} onCheckedChange={setShowOwners} />
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />} Create link & copy
            </Button>
          </form>

          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Links for this project</h3>
            {links === null && <p className="text-sm text-muted-foreground">Loading…</p>}
            {links?.length === 0 && <p className="text-sm text-muted-foreground">No links yet.</p>}
            <ul className="grid gap-2">
              {links?.map((l) => {
                const st = linkState(l);
                const active = st.label === "Active";
                return (
                  <li key={l.id} className="rounded-xl border p-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{l.label || "Client link"}</span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {formatDate(l.created_at)}
                      {l.expires_at ? ` · ${active ? "expires" : "expired"} ${formatDate(l.expires_at)}` : " · no expiry"}
                      {l.last_viewed_at ? ` · last opened ${formatDate(l.last_viewed_at)}` : " · not opened yet"}
                    </p>
                    {active && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => copy(l.token)}>
                          {copied === l.token ? <Check aria-hidden /> : <Copy aria-hidden />} Copy link
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={async () => {
                            if (!(await confirm("Turn this link off?", { body: "The client will no longer be able to open it.", confirmLabel: "Turn off" }))) return;
                            const res = await revokeShareLink(l.id);
                            if (!res.ok) return void toast.error(res.error);
                            setLinks((ls) => ls?.map((x) => (x.id === l.id ? { ...x, revoked_at: new Date().toISOString() } : x)) ?? null);
                            toast.success("Link turned off");
                          }}
                        >
                          Turn off
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          {dialog}
        </DialogContent>
      )}
    </Dialog>
  );
}
