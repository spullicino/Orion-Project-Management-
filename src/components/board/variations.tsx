"use client";

import { FileDiff, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createVariation, updateVariation } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/board";
import { cn, formatDate } from "@/lib/utils";
import { VARIATION_APPROVAL, voNumber, type BoardTask, type VariationApproval } from "@/types/board";
import { useBoard } from "./board-context";

/** Strips a leading "VO-001 · " so a variation of a variation doesn't stack numbers. */
const baseTitle = (t: string) => t.replace(/^VO-\d+ · /, "");

/** Managers: "Client change → Variation" (from a task) or "New variation" (on its own). */
export function VariationDialog({ source, onClose }: { source: BoardTask | null; onClose: () => void }) {
  const { board, openTask } = useBoard();
  const router = useRouter();
  const [title, setTitle] = useState(source ? baseTitle(source.title) : "");
  const [reason, setReason] = useState("");
  const [by, setBy] = useState("");
  const [on, setOn] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        title={source ? "Client change → Variation" : "New variation"}
        description={
          source
            ? `“${source.title}” stays as it is. A new task (VO-…) is added to the Variations group for the extra work.`
            : "Extra work the client asked for. It's added to the Variations group as VO-…."
        }
        className="max-w-lg"
      >
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await createVariation({ project_id: board.project.id, source_id: source?.id ?? null, title, reason, requested_by: by, requested_on: on });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success("Variation added — opening it");
            onClose();
            router.refresh();
            openTask(res.data!.id);
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Name
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={250} placeholder="e.g. Extra doors in partition" required={!source} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            What does the client want changed?
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={4000} required placeholder="e.g. Add 2 doors to the partition between offices 3 and 4" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Requested by (optional)
              <Input value={by} onChange={(e) => setBy(e.target.value)} maxLength={160} placeholder="e.g. Mr Borg (client)" />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Requested on
              <Input type="date" value={on} max={todayISO()} onChange={(e) => setOn(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">It starts as “Awaiting client approval”. {source ? "The same people are assigned as on the original." : ""}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !reason.trim() || (!source && !title.trim())}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileDiff aria-hidden />} Create variation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDetailsDialog({ task, onClose }: { task: BoardTask; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState(task.variation_reason ?? "");
  const [by, setBy] = useState(task.variation_requested_by ?? "");
  const [on, setOn] = useState(task.variation_requested_on ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={`${voNumber(task.variation_no ?? 0)} details`} className="max-w-lg">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await updateVariation(task.id, { variation_reason: reason.trim() || null, variation_requested_by: by.trim() || null, variation_requested_on: on || null });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success("Saved");
            router.refresh();
            onClose();
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            What the client wants changed
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={4000} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Requested by
              <Input value={by} onChange={(e) => setBy(e.target.value)} maxLength={160} />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Requested on
              <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApprovalPill({ approval, className }: { approval: VariationApproval | null | undefined; className?: string }) {
  const a = VARIATION_APPROVAL[approval ?? "pending"];
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold", a.tone, className)}>{a.label}</span>;
}

/** In the task panel: the variation's details and approval, and the links between original and variations. */
export function VariationSection({ task }: { task: BoardTask }) {
  const { perms, byId, openTask, board } = useBoard();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState<VariationApproval | null>(null);
  const isVariation = task.variation_no != null;
  const original = task.variation_of ? (byId.get(task.variation_of) ?? null) : null;
  const children = board.tasks.filter((t) => t.variation_of === task.id && t.variation_no != null).sort((a, b) => (a.variation_no ?? 0) - (b.variation_no ?? 0));
  if (!isVariation && !children.length) return null;

  return (
    <section className="grid gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      {isVariation && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <FileDiff className="size-4 text-amber-700 dark:text-amber-400" aria-hidden /> Variation {voNumber(task.variation_no!)}
            </span>
            <ApprovalPill approval={task.variation_approval} />
            {perms.canManage && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing(true)}>
                <Pencil aria-hidden /> Edit details
              </Button>
            )}
          </div>
          {task.variation_reason && <p className="whitespace-pre-wrap break-words text-sm">{task.variation_reason}</p>}
          <p className="text-xs text-muted-foreground">
            {[task.variation_requested_by ? `Requested by ${task.variation_requested_by}` : null, task.variation_requested_on ? `on ${formatDate(task.variation_requested_on)}` : null]
              .filter(Boolean)
              .join(" ")}
          </p>
          {original ? (
            <button type="button" onClick={() => openTask(original.id)} className="justify-self-start text-sm font-medium text-primary hover:underline">
              Variation of: {original.title}
            </button>
          ) : task.variation_of ? (
            <p className="text-sm text-muted-foreground">Variation of a task that was deleted.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Extra work, not linked to an existing task.</p>
          )}
          {perms.canManage && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Client approval">
              {(["pending", "approved", "rejected"] as VariationApproval[]).map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant={(task.variation_approval ?? "pending") === a ? "default" : "outline"}
                  disabled={!!saving}
                  onClick={async () => {
                    setSaving(a);
                    const res = await updateVariation(task.id, { variation_approval: a });
                    setSaving(null);
                    if (!res.ok) return void toast.error(res.error);
                    router.refresh();
                  }}
                >
                  {saving === a && <Loader2 className="animate-spin" aria-hidden />}
                  {a === "pending" ? "Awaiting" : a === "approved" ? "Approved" : "Rejected"}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
      {children.length > 0 && (
        <div className="grid gap-1">
          <span className="text-sm font-semibold">Variations of this task</span>
          {children.map((c) => (
            <button key={c.id} type="button" onClick={() => openTask(c.id)} className="flex min-h-9 items-center gap-2 text-left text-sm hover:underline">
              <span className="min-w-0 flex-1 truncate font-medium text-primary">{c.title}</span>
              <ApprovalPill approval={c.variation_approval} className="shrink-0" />
            </button>
          ))}
        </div>
      )}
      {editing && <EditDetailsDialog task={task} onClose={() => setEditing(false)} />}
    </section>
  );
}
