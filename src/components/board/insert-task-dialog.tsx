"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { insertTaskAt } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { suggestDates } from "@/lib/board";
import type { BoardTask } from "@/types/board";
import { useBoard } from "./board-context";

/** "Insert task above/below": a new task right next to this one, keeping linked tasks in a chain. */
export function InsertTaskDialog({ anchor, where, onClose }: { anchor: BoardTask; where: "above" | "below"; onClose: () => void }) {
  const { tasks, perms, openTask } = useBoard();
  const initial = suggestDates(anchor, where);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(initial.start);
  const [due, setDue] = useState(initial.due);
  const [busy, setBusy] = useState(false);
  // Is there a chain to keep in order?
  const chain = where === "below" ? tasks.find((t) => t.blocked_by.includes(anchor.id)) : anchor.blocked_by.length > 0 ? tasks.find((t) => t.id === anchor.blocked_by[0]) : undefined;
  const [rewire, setRewire] = useState(true);
  const showRewire = perms.canManage && !!chain;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={where === "below" ? "Insert a task below" : "Insert a task above"} description={`${where === "below" ? "After" : "Before"} “${anchor.title}”, in the same group.`}>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (start && due && due < start) return void toast.error("The due date can't be before the start date.");
            setBusy(true);
            const res = await insertTaskAt(anchor.id, { where, title, start_date: start || null, due_date: due || null, rewire: showRewire && rewire });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success("Task added");
            onClose();
            openTask(res.data!.id);
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Task name
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pressure test" maxLength={300} required autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm font-medium">
              Start
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Due
              <Input type="date" value={due} min={start || undefined} onChange={(e) => setDue(e.target.value)} />
            </label>
          </div>
          {showRewire && (
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" checked={rewire} onChange={(e) => setRewire(e.target.checked)} className="mt-0.5 size-5 accent-primary" />
              <span>
                <span className="block font-medium">Keep the chain in order</span>
                <span className="block text-muted-foreground">
                  {where === "below"
                    ? `“${chain!.title}” will wait for the new task, and the new task waits for “${anchor.title}”.`
                    : `The new task waits for “${chain!.title}”, and “${anchor.title}” waits for the new task.`}{" "}
                  Later dates aren&apos;t moved.
                </span>
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Add task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
