"use client";

import { Copy, Plus, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addCustomColumn,
  addMembers,
  deleteCustomColumn,
  deleteLabel,
  deleteProject,
  removeMember,
  saveAsTemplate,
  saveLabel,
  setHiddenColumns,
  type Result,
} from "@/app/(app)/projects/actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { fullName } from "@/lib/utils";
import { BUILTIN_COLUMNS, type Board, type BuiltinColumn, type StatusLabel } from "@/types/board";
import type { AppRole } from "@/types/database";

type Person = { id: string; first_name: string; last_name: string; email: string; avatar_src: string | null; role: AppRole };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result<unknown>>, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        if (res.message) toast.success(res.message);
        onOk?.();
      }
    });
  return { pending, run };
}

// ---------------------------------------------------------------------------

export function MembersCard({ board, people }: { board: Board; people: Person[] }) {
  const { pending, run } = useRun();
  const { confirm, dialog } = useConfirm();
  const [toAdd, setToAdd] = useState("");
  const memberIds = new Set(board.members.map((m) => m.user_id));
  const candidates = people.filter((p) => !memberIds.has(p.id));
  return (
    <Card>
      <CardHeader>
        <CardTitle>People on this project</CardTitle>
        <CardDescription>Technicians and Basic users only see projects they are added to. Managers and admins see everything.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y rounded-xl border">
          {board.members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 p-3">
              <UserAvatar person={m} src={m.avatar_src} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{fullName(m)}</span>
                <span className="block text-xs text-muted-foreground">{m.role ? ROLE_LABEL[m.role] : ""}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${fullName(m)} from project`}
                disabled={pending}
                onClick={async () => {
                  if (await confirm(`Remove ${fullName(m)} from this project?`, { body: "They keep their account, but technicians and basic users will no longer see this project.", confirmLabel: "Remove" }))
                    run(() => removeMember(board.project.id, m.user_id));
                }}
              >
                <UserMinus />
              </Button>
            </li>
          ))}
          {board.members.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nobody yet.</li>}
        </ul>
        {candidates.length > 0 && (
          <div className="flex gap-2">
            <NativeSelect aria-label="Person to add" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
              <option value="">Choose a person to add…</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p)} ({ROLE_LABEL[p.role]})
                </option>
              ))}
            </NativeSelect>
            <Button disabled={!toAdd || pending} onClick={() => run(() => addMembers(board.project.id, [toAdd]), () => setToAdd(""))}>
              <UserPlus aria-hidden /> Add
            </Button>
          </div>
        )}
        {dialog}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function LabelRow({ projectId, label }: { projectId: string; label?: StatusLabel }) {
  const { pending, run } = useRun();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState(label?.color ?? "#64748b");
  const [isDone, setIsDone] = useState(label?.is_done ?? false);
  const dirty = !label || name !== label.name || color !== label.color || isDone !== label.is_done;
  return (
    <li className="grid grid-cols-[44px_1fr] items-center gap-2 py-2 sm:grid-cols-[44px_1fr_auto_auto]">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Status colour" className="size-11 cursor-pointer rounded-lg border bg-card p-1" />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={label ? "Status name" : "New status, e.g. Waiting for client"} aria-label="Status name" maxLength={40} />
      <label className="col-start-2 flex h-11 items-center gap-2 text-sm sm:col-start-auto">
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={isDone} onChange={(e) => setIsDone(e.target.checked)} />
        Counts as done
      </label>
      <div className="col-start-2 flex gap-1 sm:col-start-auto">
        <Button
          variant={dirty ? "default" : "outline"}
          disabled={!dirty || !name.trim() || pending}
          onClick={() =>
            run(
              () => saveLabel(projectId, label?.id ?? null, { name, color, is_done: isDone }),
              () => {
                if (!label) {
                  setName("");
                  setIsDone(false);
                }
              },
            )
          }
        >
          {label ? "Save" : <><Plus aria-hidden /> Add</>}
        </Button>
        {label && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete status ${label.name}`}
            disabled={pending}
            onClick={async () => {
              if (await confirm(`Delete the status “${label.name}”?`, { body: "Tasks with this status will have no status." })) run(() => deleteLabel(projectId, label.id));
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {dialog}
    </li>
  );
}

export function StatusesCard({ board }: { board: Board }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Statuses</CardTitle>
        <CardDescription>The coloured labels on the board and the Kanban columns. Tick “Counts as done” for finished statuses.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {board.labels.map((l) => (
            <LabelRow key={`${l.id}-${l.name}-${l.color}-${l.is_done}`} projectId={board.project.id} label={l} />
          ))}
          <LabelRow key={`new-${board.labels.length}`} projectId={board.project.id} />
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

const BUILTIN_LABELS: Record<BuiltinColumn, string> = {
  status: "Status",
  owners: "Owners",
  priority: "Priority",
  start_date: "Start date",
  due_date: "Due date",
  progress: "Progress",
  dependencies: "Waiting for (dependencies)",
};

export function ColumnsCard({ board }: { board: Board }) {
  const { pending, run } = useRun();
  const { confirm, dialog } = useConfirm();
  const [hidden, setHidden] = useState<string[]>(board.project.hidden_columns);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"text" | "number" | "file">("text");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Board columns</CardTitle>
        <CardDescription>Choose which columns the board table shows (on computers). Phones always show a simple card.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <ul className="grid gap-1 sm:grid-cols-2">
          {BUILTIN_COLUMNS.map((c) => (
            <li key={c}>
              <label className="flex h-11 items-center justify-between gap-3 rounded-lg px-2 hover:bg-accent">
                <span className="text-sm">{BUILTIN_LABELS[c]}</span>
                <Switch
                  checked={!hidden.includes(c)}
                  disabled={pending}
                  onCheckedChange={(on) => {
                    const next = on ? hidden.filter((x) => x !== c) : [...hidden, c];
                    setHidden(next);
                    run(() => setHiddenColumns(board.project.id, next));
                  }}
                />
              </label>
            </li>
          ))}
        </ul>
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Extra columns</h3>
          <ul className="divide-y rounded-xl border">
            {board.columns.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-1">
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <span className="text-xs capitalize text-muted-foreground">{c.kind === "file" ? "Files" : c.kind}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete column ${c.name}`}
                  onClick={async () => {
                    if (await confirm(`Delete the column “${c.name}”?`, { body: "Values typed in this column will no longer be shown." })) run(() => deleteCustomColumn(board.project.id, c.id));
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
            {board.columns.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No extra columns.</li>}
          </ul>
          <form
            className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addCustomColumn({ project_id: board.project.id, name, kind }), () => setName(""));
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Column name, e.g. Room, Qty, PO number" aria-label="New column name" maxLength={60} />
            <NativeSelect aria-label="Column type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="file">Files</option>
            </NativeSelect>
            <Button type="submit" disabled={!name.trim() || pending}>
              <Plus aria-hidden /> Add column
            </Button>
          </form>
        </div>
        {dialog}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function TemplateAndDangerCard({ board, isAdmin }: { board: Board; isAdmin: boolean }) {
  const router = useRouter();
  const { pending, run } = useRun();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState(`${board.project.name} (template)`);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Templates</CardTitle>
        <CardDescription>Save this project&apos;s groups, tasks, statuses and checklists as a starting point for future projects. People, comments and files are not copied.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {!board.project.is_template && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" maxLength={160} />
            <Button variant="outline" disabled={pending || !name.trim()} onClick={() => run(() => saveAsTemplate(board.project.id, name), () => router.push("/projects?view=templates"))}>
              <Copy aria-hidden /> Save as template
            </Button>
          </div>
        )}
        {isAdmin && (
          <div className="rounded-xl border border-destructive/40 p-4">
            <h3 className="font-semibold text-destructive">Delete {board.project.is_template ? "template" : "project"}</h3>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">
              Permanently deletes all its tasks, comments, files, daily updates and chat. To keep the history, set the status to “Archived” instead.
            </p>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (await confirm(`Delete “${board.project.name}” forever?`, {
                    body: "All its tasks, comments, files, daily updates, materials and chat are deleted. This cannot be undone and can't be restored from the Recycle bin.",
                    confirmLabel: "Delete forever",
                    typeToConfirm: board.project.name,
                  }))
                  run(() => deleteProject(board.project.id), () => router.push("/projects"));
              }}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          </div>
        )}
        {dialog}
      </CardContent>
    </Card>
  );
}
