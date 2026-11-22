"use client";

import { Copy, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { copyTask, loadCopyTargets, type CopyTarget } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { BoardTask } from "@/types/board";

type Choice = { group_id: string; due_date: string };

/** "Copy to other projects": pick projects, and for each a group and due date. */
export function CopyTaskDialog({
  task,
  groupName,
  open,
  onClose,
  initialTargets = null,
}: {
  task: BoardTask;
  groupName: string;
  open: boolean;
  onClose: () => void;
  /** Development preview only (no database). */
  initialTargets?: CopyTarget[] | null;
}) {
  const [targets, setTargets] = useState<CopyTarget[] | null>(initialTargets);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, Choice>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || targets) return;
    void loadCopyTargets(task.project_id).then((r) => (r.ok ? setTargets(r.data ?? []) : setError(r.error)));
  }, [open, targets, task.project_id]);

  const shown = useMemo(() => (targets ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())), [targets, q]);
  const count = Object.keys(chosen).length;

  const toggle = (p: CopyTarget) =>
    setChosen((c) => {
      const next = { ...c };
      if (next[p.id]) delete next[p.id];
      else {
        const sameName = p.groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase());
        next[p.id] = { group_id: (sameName ?? p.groups[0])?.id ?? "", due_date: task.due_date ?? "" };
      }
      return next;
    });

  const submit = async () => {
    setBusy(true);
    const res = await copyTask(task.id, {
      targets: Object.entries(chosen).map(([project_id, c]) => ({ project_id, group_id: c.group_id || null, due_date: c.due_date || null })),
    });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    const copied = res.data ?? [];
    const names = new Map((targets ?? []).map((p) => [p.id, p.name]));
    toast.success(
      <span>
        Copied to {copied.length === 1 ? names.get(copied[0].project_id) : `${copied.length} projects`}.{" "}
        {copied.length === 1 && (
          <Link className="font-semibold underline" href={`/projects/${copied[0].project_id}/board?task=${copied[0].task_id}`}>
            Open it
          </Link>
        )}
      </span>,
    );
    setChosen({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Copy to other projects" description={`Copy “${task.title}” with its details and checklist. Each copy starts as Not started.`} className="max-w-lg">
        {error ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        ) : !targets ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading projects…
          </p>
        ) : targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">There are no other projects you can add tasks to.</p>
        ) : (
          <div className="grid gap-3">
            {targets.length > 6 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a project" aria-label="Find a project" className="pl-9" />
              </div>
            )}
            <ul className="grid max-h-[50dvh] gap-2 overflow-y-auto">
              {shown.map((p) => {
                const c = chosen[p.id];
                return (
                  <li key={p.id} className="rounded-xl border">
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3">
                      <input type="checkbox" checked={!!c} onChange={() => toggle(p)} className="size-5 accent-primary" />
                      <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                      <span className="flex-1 font-medium">{p.name}</span>
                    </label>
                    {c && (
                      <div className="grid gap-2 border-t px-3 pb-3 pt-2 sm:grid-cols-2">
                        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                          Group
                          <NativeSelect value={c.group_id} onChange={(e) => setChosen((x) => ({ ...x, [p.id]: { ...c, group_id: e.target.value } }))}>
                            {p.groups.length === 0 && <option value="">(new group “Tasks”)</option>}
                            {p.groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </NativeSelect>
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                          Due date
                          <Input type="date" value={c.due_date} onChange={(e) => setChosen((x) => ({ ...x, [p.id]: { ...c, due_date: e.target.value } }))} />
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
              {shown.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">No project matches.</li>}
            </ul>
            <p className="text-xs text-muted-foreground">
              Owners are kept if they&apos;re on that project. Comments, files, history and “waiting for” links stay with the original.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!count || busy}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Copy aria-hidden />}
                {count > 1 ? `Copy to ${count} projects` : "Copy"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
