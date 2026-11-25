"use client";

import { Briefcase, Check, MessageSquare, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateGeneralTask } from "@/app/(app)/my-tasks/general-actions";
import { Button } from "@/components/ui/button";
import { bucketMyTasks, DUE_STYLES, dueState, shortDate } from "@/lib/board";
import { cn, fullName, readableTextOn } from "@/lib/utils";
import type { MyTask } from "@/types/board";
import type { AppRole } from "@/types/database";
import { GENERAL_STATUSES, type GeneralTask } from "@/types/general-tasks";
import { GeneralTaskSheet, type PickClient, type PickPerson, type PickProject } from "./general-task-sheet";
import { TaskItem } from "./my-tasks-list";

type Item = { kind: "project"; task: MyTask; completed_at: string | null; due_date: string | null } | { kind: "general"; task: GeneralTask; completed_at: string | null; due_date: string | null };

function GeneralItem({ task, canTick, showPeople, onOpen, onChanged }: { task: GeneralTask; canTick: boolean; showPeople: boolean; onOpen: () => void; onChanged: () => void }) {
  const [done, setDone] = useState(task.status === "done");
  const [pending, start] = useTransition();
  const state = dueState(task.due_date, done);
  const status = GENERAL_STATUSES.find((s) => s.value === task.status)!;
  return (
    <li className="flex items-stretch overflow-hidden rounded-xl border bg-card">
      {canTick && (
        <button
          type="button"
          disabled={pending}
          aria-pressed={done}
          aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          className="flex w-14 shrink-0 items-center justify-center border-r hover:bg-accent"
          onClick={() =>
            start(async () => {
              const next = !done;
              setDone(next);
              const res = await updateGeneralTask(task.id, { status: next ? "done" : "working" });
              if (!res.ok) {
                setDone(!next);
                toast.error(res.error);
              } else {
                if (next) toast.success("Nice work! Task marked as done.");
                onChanged();
              }
            })
          }
        >
          <span className={cn("flex size-7 items-center justify-center rounded-full border-2", done ? "border-success bg-success text-white" : "border-muted-foreground/40")}>
            {done && <Check className="size-4" aria-hidden />}
          </span>
        </button>
      )}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 px-4 py-3 text-left hover:bg-accent/40">
        <span className={cn("block font-medium", done && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Briefcase className="size-3.5" aria-hidden />
            {task.client ? `General · ${task.client.name}` : "General"}
          </span>
          <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: status.color, color: readableTextOn(status.color) }}>
            {status.label}
          </span>
          {task.due_date && <span className={DUE_STYLES[state]}>{shortDate(task.due_date)}</span>}
          {task.comment_count > 0 && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MessageSquare className="size-3.5" aria-hidden /> {task.comment_count}
            </span>
          )}
          <span className="text-muted-foreground">{showPeople ? `→ ${task.assignees.map((a) => fullName(a)).join(", ")}` : `from ${task.creator_name}`}</span>
        </span>
      </button>
    </li>
  );
}

export function MyTasksView({
  projectTasks,
  general,
  me,
  canEditProjectTasks,
  people,
  clients,
  projects = [],
  openId,
}: {
  projectTasks: MyTask[];
  general: GeneralTask[] | null; // null: database update 0026 not run yet
  me: { id: string; role: AppRole };
  canEditProjectTasks: boolean;
  people: PickPerson[];
  clients: PickClient[];
  projects?: PickProject[];
  openId: string | null;
}) {
  const router = useRouter();
  const isManagerPlus = me.role === "admin" || me.role === "manager";
  const [tab, setTab] = useState<"mine" | "gave">("mine");
  const [open, setOpen] = useState<string | "new" | null>(openId);
  const refresh = () => router.refresh();

  const mineGeneral = useMemo(() => (general ?? []).filter((t) => t.assignees.some((a) => a.id === me.id)), [general, me.id]);
  const gave = useMemo(() => (general ?? []).filter((t) => t.created_by === me.id), [general, me.id]);
  const items: Item[] = useMemo(
    () => [
      ...projectTasks.map((t) => ({ kind: "project" as const, task: t, completed_at: t.completed_at, due_date: t.due_date })),
      ...mineGeneral.map((t) => ({ kind: "general" as const, task: t, completed_at: t.completed_at, due_date: t.due_date })),
    ],
    [projectTasks, mineGeneral],
  );
  const buckets = bucketMyTasks(items);
  const openTask = open && open !== "new" ? ((general ?? []).find((t) => t.id === open) ?? null) : null;
  const gaveOpen = gave.filter((t) => !t.completed_at);
  const gaveDone = gave.filter((t) => t.completed_at);

  return (
    <div className="grid gap-5">
      {(isManagerPlus || gave.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Which tasks" className="inline-flex rounded-lg border bg-card p-0.5">
            {[
              { v: "mine" as const, label: "Assigned to me" },
              { v: "gave" as const, label: `Tasks I gave${gaveOpen.length ? ` (${gaveOpen.length})` : ""}` },
            ].map((t) => (
              <button
                key={t.v}
                type="button"
                role="tab"
                aria-selected={tab === t.v}
                onClick={() => setTab(t.v)}
                className={cn("h-10 rounded-md px-3 text-sm font-medium", tab === t.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t.label}
              </button>
            ))}
          </div>
          {isManagerPlus && general !== null && (
            <Button className="ml-auto" onClick={() => setOpen("new")}>
              <Plus aria-hidden /> New task
            </Button>
          )}
        </div>
      )}

      {tab === "mine" ? (
        items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Nothing assigned to you right now. 🎉</p>
        ) : (
          buckets.map((b) => (
            <section key={b.key} aria-labelledby={`bucket-${b.key}`}>
              <h2 id={`bucket-${b.key}`} className={cn("mb-2 text-sm font-semibold uppercase tracking-wide", b.key === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                {b.label} <span className="font-normal">({b.tasks.length})</span>
              </h2>
              <ul className="grid gap-2">
                {b.tasks.map((it) =>
                  it.kind === "project" ? (
                    <TaskItem key={it.task.id} task={it.task} canEdit={canEditProjectTasks} />
                  ) : (
                    <GeneralItem key={it.task.id} task={it.task} canTick showPeople={false} onOpen={() => setOpen(it.task.id)} onChanged={refresh} />
                  ),
                )}
              </ul>
            </section>
          ))
        )
      ) : (
        <div className="grid gap-5">
          <p className="text-sm text-muted-foreground">General tasks you gave to colleagues — not linked to a project. Tap one to see progress and comments.</p>
          {gave.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">You haven&apos;t given any general tasks yet. Tap “New task”.</p>}
          {[
            { key: "open", label: "Still open", list: gaveOpen },
            { key: "done", label: "Done (last 30 days)", list: gaveDone },
          ]
            .filter((g) => g.list.length)
            .map((g) => (
              <section key={g.key} aria-labelledby={`gave-${g.key}`}>
                <h2 id={`gave-${g.key}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label} <span className="font-normal">({g.list.length})</span>
                </h2>
                <ul className="grid gap-2">
                  {g.list.map((t) => (
                    <GeneralItem key={t.id} task={t} canTick={false} showPeople onOpen={() => setOpen(t.id)} onChanged={refresh} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      {open && (open === "new" || openTask) && (
        <GeneralTaskSheet
          key={open}
          task={open === "new" ? null : openTask}
          open
          onClose={() => {
            setOpen(null);
            if (openId) router.replace("/my-tasks", { scroll: false });
          }}
          onChanged={refresh}
          me={me}
          people={people}
          clients={clients}
          projects={projects}
        />
      )}
    </div>
  );
}
