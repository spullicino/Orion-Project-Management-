"use client";

import { CopyPlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { duplicateTask } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { BoardTask } from "@/types/board";
import { useBoard } from "./board-context";

/** Duplicate a task inside the same project — right below it, or into another group. */
export function DuplicateTaskDialog({ task, open, onClose }: { task: Pick<BoardTask, "id" | "title" | "group_id" | "due_date" | "start_date">; open: boolean; onClose: () => void }) {
  const { board, openTask } = useBoard();
  const [groupId, setGroupId] = useState(task.group_id);
  const [keepDates, setKeepDates] = useState(true);
  const [busy, setBusy] = useState(false);
  const hasDates = !!(task.due_date || task.start_date);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title="Duplicate task" description={`Makes a copy of “${task.title}” in this project, with its description, checklist (unticked), people and priority. Comments and files aren't copied.`}>
        <div className="grid gap-4">
          <label className="grid gap-1 text-sm font-medium">
            Put the copy in
            <NativeSelect value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {board.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.id === task.group_id ? " (right below this task)" : ""}
                </option>
              ))}
            </NativeSelect>
          </label>
          {hasDates && (
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span>
                Keep the same dates
                <span className="block text-xs text-muted-foreground">Switch off to set new dates on the copy yourself.</span>
              </span>
              <Switch checked={keepDates} onCheckedChange={setKeepDates} />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await duplicateTask(task.id, { group_id: groupId, keep_dates: keepDates });
                setBusy(false);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Task duplicated — opening the copy");
                onClose();
                openTask(res.data!.id);
              }}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <CopyPlus aria-hidden />} Duplicate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
