"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { markTaskDone } from "@/app/(app)/projects/actions";
import { bucketMyTasks, DUE_STYLES, dueState, shortDate } from "@/lib/board";
import { cn } from "@/lib/utils";
import { readableTextOn } from "@/lib/utils";
import type { MyTask } from "@/types/board";

export function TaskItem({ task, canEdit }: { task: MyTask; canEdit: boolean }) {
  const [done, setDone] = useState(!!task.completed_at);
  const [pending, start] = useTransition();
  const state = dueState(task.due_date, done);
  const toggle = () =>
    start(async () => {
      const next = !done;
      setDone(next);
      const res = await markTaskDone(task.id, next);
      if (!res.ok) {
        setDone(!next);
        toast.error(res.error);
      } else if (next) toast.success("Nice work! Task marked as done.");
    });
  return (
    <li className="flex items-stretch overflow-hidden rounded-xl border bg-card">
      {canEdit && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={done}
          aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          className="flex w-14 shrink-0 items-center justify-center border-r hover:bg-accent"
        >
          <span className={cn("flex size-7 items-center justify-center rounded-full border-2", done ? "border-success bg-success text-white" : "border-muted-foreground/40")}>
            {done && <Check className="size-4" aria-hidden />}
          </span>
        </button>
      )}
      <Link href={`/projects/${task.project_id}/board?task=${task.id}`} className="min-w-0 flex-1 px-4 py-3 hover:bg-accent/40">
        <span className={cn("block font-medium", done && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ background: task.project.color }} aria-hidden />
            {task.project.name}
          </span>
          {task.status && (
            <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: task.status.color, color: readableTextOn(task.status.color) }}>
              {task.status.name}
            </span>
          )}
          {task.due_date && <span className={DUE_STYLES[state]}>{shortDate(task.due_date)}</span>}
        </span>
      </Link>
    </li>
  );
}

export function MyTasksList({ tasks, canEdit }: { tasks: MyTask[]; canEdit: boolean }) {
  const buckets = bucketMyTasks(tasks);
  if (!tasks.length)
    return <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Nothing assigned to you right now. 🎉</p>;
  return (
    <div className="grid gap-6">
      {buckets.map((b) => (
        <section key={b.key} aria-labelledby={`bucket-${b.key}`}>
          <h2 id={`bucket-${b.key}`} className={cn("mb-2 text-sm font-semibold uppercase tracking-wide", b.key === "overdue" ? "text-destructive" : "text-muted-foreground")}>
            {b.label} <span className="font-normal">({b.tasks.length})</span>
          </h2>
          <ul className="grid gap-2">
            {b.tasks.map((t) => (
              <TaskItem key={t.id} task={t} canEdit={canEdit} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
