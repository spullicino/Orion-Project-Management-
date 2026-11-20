"use client";

import { Camera, ChevronDown, ImagePlus, Loader2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/board";
import { processPhoto, type ProcessedPhoto } from "@/lib/images/compress";
import { cn } from "@/lib/utils";
import { MAX_PHOTOS_PER_UPDATE } from "@/lib/validation/diary";
import { useOutbox } from "./outbox-provider";

type Project = { id: string; name: string; color: string };
const LAST_PROJECT = "orion:last-daily-project";
const DRAFT = "orion:daily-draft";

function safeStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function DailyUpdateForm({ projects, initialProject }: { projects: Project[]; initialProject?: string | null }) {
  const { enqueue } = useOutbox();
  const today = todayISO();
  const [projectId, setProjectId] = useState(initialProject ?? "");
  const [date, setDate] = useState(today);
  const [workDone, setWorkDone] = useState("");
  const [hours, setHours] = useState("");
  const [issues, setIssues] = useState("");
  const [showIssues, setShowIssues] = useState(false);
  const [photos, setPhotos] = useState<ProcessedPhoto[]>([]);
  const [processing, setProcessing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  // Remember the last project and any unsent text (in case the app is closed mid-way).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restoring saved state from this phone */
    if (!initialProject) {
      const last = safeStorage(() => localStorage.getItem(LAST_PROJECT), null);
      if (last && projects.some((p) => p.id === last)) setProjectId(last);
      else if (projects.length === 1) setProjectId(projects[0].id);
    }
    const draft = safeStorage(() => JSON.parse(localStorage.getItem(DRAFT) ?? "null") as { workDone: string; hours: string; issues: string } | null, null);
    if (draft) {
      setWorkDone(draft.workDone ?? "");
      setHours(draft.hours ?? "");
      setIssues(draft.issues ?? "");
      if (draft.issues) setShowIssues(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialProject, projects]);

  useEffect(() => {
    safeStorage(() => localStorage.setItem(DRAFT, JSON.stringify({ workDone, hours, issues })), undefined);
  }, [workDone, hours, issues]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const room = MAX_PHOTOS_PER_UPDATE - photos.length - processing;
    if (list.length > room) toast.warning(`You can add up to ${MAX_PHOTOS_PER_UPDATE} photos per update.`);
    const accepted = list.slice(0, Math.max(0, room));
    setProcessing((n) => n + accepted.length);
    for (const f of accepted) {
      try {
        const p = await processPhoto(f);
        setPhotos((ps) => [...ps, p]);
      } catch {
        toast.error(`Couldn't read ${f.name}. Try another photo.`);
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  }

  function removePhoto(id: string) {
    setPhotos((ps) => {
      const p = ps.find((x) => x.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return ps.filter((x) => x.id !== id);
    });
  }

  async function submit() {
    setError(null);
    const project = projects.find((p) => p.id === projectId);
    if (!project) return setError("Choose the project.");
    if (!workDone.trim()) return setError("Write what you did today.");
    const h = hours.trim() === "" ? null : Number(hours);
    if (h !== null && (!Number.isFinite(h) || h < 0 || h > 24)) return setError("Hours must be between 0 and 24.");
    if (date > today) return setError("The date can't be in the future.");
    if (processing) return setError("Please wait — photos are still being prepared.");
    setSaving(true);
    try {
      await enqueue({
        client_ref: crypto.randomUUID(),
        project_id: project.id,
        project_name: project.name,
        work_date: date,
        work_done: workDone.trim(),
        hours: h,
        issues: issues.trim() || null,
        photos: photos.map((p) => ({ id: p.id, full: p.full, thumb: p.thumb, width: p.width, height: p.height, uploaded: false })),
      });
      safeStorage(() => localStorage.setItem(LAST_PROJECT, project.id), undefined);
      safeStorage(() => localStorage.removeItem(DRAFT), undefined);
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPhotos([]);
      setWorkDone("");
      setHours("");
      setIssues("");
      setShowIssues(false);
      setDate(today);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("This phone couldn't save the update. Check that the browser isn't in private mode and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!projects.length) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">You&apos;re not on any active project yet. Ask a manager to add you.</p>;
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
        <FormField id="d-project" label="Project">
          <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
            <option value="" disabled>
              Choose a project…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="d-date" label="Date">
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </FormField>
      </div>

      <FormField id="d-work" label="What did you do today?">
        <Textarea value={workDone} onChange={(e) => setWorkDone(e.target.value)} maxLength={8000} className="min-h-32" placeholder="e.g. Finished boarding meeting room 2, started electrical containment on level 3." />
      </FormField>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Hours (optional)</span>
        <div className="flex flex-wrap items-center gap-2">
          {["4", "8", "9", "10"].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(hours === h ? "" : h)}
              aria-pressed={hours === h}
              className={cn("h-11 min-w-14 rounded-lg border px-3 text-sm font-medium", hours === h ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}
            >
              {h} h
            </button>
          ))}
          <Input
            aria-label="Other number of hours"
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="Other"
            className="w-24"
          />
        </div>
      </div>

      {showIssues ? (
        <FormField id="d-issues" label="Issues or delays">
          <Textarea value={issues} onChange={(e) => setIssues(e.target.value)} maxLength={4000} placeholder="e.g. Waiting for the landlord's permit; materials arrived late." />
        </FormField>
      ) : (
        <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setShowIssues(true)}>
          <ChevronDown aria-hidden /> Add issues or delays
        </Button>
      )}

      <div className="grid gap-2">
        <span className="text-sm font-medium">Photos {photos.length > 0 && `(${photos.length})`}</span>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a photo" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={gallery} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-label="Choose photos" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="lg" onClick={() => camera.current?.click()}>
            <Camera aria-hidden /> Take photo
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => gallery.current?.click()}>
            <ImagePlus aria-hidden /> From gallery
          </Button>
        </div>
        {(photos.length > 0 || processing > 0) && (
          <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((p) => (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={p.previewUrl} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  aria-label="Remove this photo"
                  className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
            {Array.from({ length: processing }).map((_, i) => (
              <li key={`p${i}`} className="flex aspect-square items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Loader2 className="size-6 animate-spin" aria-label="Preparing photo" />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Photos are made smaller on your phone before sending, to save data.</p>
      </div>

      <Button type="submit" size="lg" disabled={saving || processing > 0} className="w-full sm:w-auto sm:justify-self-start">
        {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Post update
      </Button>
    </form>
  );
}
