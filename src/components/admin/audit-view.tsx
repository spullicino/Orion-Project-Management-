"use client";

import { ArchiveRestore, Loader2, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { loadAuditLog, restoreTask, type AuditFilters, type BinItem } from "@/app/(app)/admin/audit/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { AUDIT_ENTITIES, describeAudit, type AuditEntry } from "@/lib/audit";
import { cn } from "@/lib/utils";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Malta" }).format(new Date(iso));
const timeOf = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));

const TONE: Record<string, string> = {
  deleted: "bg-destructive/10 text-destructive",
  removed: "bg-destructive/10 text-destructive",
  unassigned: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  created: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  restored: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  added: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  assigned: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  updated: "bg-muted text-foreground",
};

export function AuditView({
  initial,
  initialMore,
  bin,
  projects,
  people,
}: {
  initial: AuditEntry[];
  initialMore: boolean;
  bin: BinItem[];
  projects: { id: string; name: string }[];
  people: { id: string; name: string }[];
}) {
  const [tab, setTab] = useState<"log" | "bin">("log");
  const [entries, setEntries] = useState(initial);
  const [more, setMore] = useState(initialMore);
  const [f, setF] = useState<AuditFilters>({ search: "", projectId: "", actorId: "", entity: "", from: "", to: "" });
  const [pending, start] = useTransition();
  const [binList, setBinList] = useState(bin);
  const [restoring, setRestoring] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = (next: AuditFilters, append = false) =>
    start(async () => {
      const res = await loadAuditLog({ ...next, search: next.search || undefined, entity: next.entity || undefined, before: append ? entries.at(-1)?.id : undefined });
      if (!res.ok) return void toast.error(res.error);
      setEntries(append ? [...entries, ...res.data.entries] : res.data.entries);
      setMore(res.data.more);
    });
  const set = (patch: Partial<AuditFilters>) => {
    const next = { ...f, ...patch };
    setF(next);
    load(next);
  };

  const router = useRouter();
  return (
    <div className="grid gap-4">
      {dialog}
      <div role="tablist" aria-label="Audit" className="inline-flex justify-self-start rounded-lg border bg-card p-0.5">
        {[
          { v: "log" as const, label: "Audit log" },
          { v: "bin" as const, label: `Recycle bin${binList.length ? ` (${binList.length})` : ""}` },
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

      {tab === "log" ? (
        <>
          <form
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              load(f);
            }}
          >
            <div className="relative sm:col-span-2 lg:col-span-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={f.search}
                onChange={(e) => setF({ ...f, search: e.target.value })}
                onBlur={() => load(f)}
                placeholder="Search task, project or person"
                aria-label="Search"
                className="pl-9"
                enterKeyHint="search"
              />
            </div>
            <NativeSelect value={f.projectId} onChange={(e) => set({ projectId: e.target.value })} aria-label="Project">
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={f.actorId} onChange={(e) => set({ actorId: e.target.value })} aria-label="Done by">
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={f.entity} onChange={(e) => set({ entity: e.target.value })} aria-label="What">
              <option value="">Everything</option>
              {AUDIT_ENTITIES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </NativeSelect>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-3">
              <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                From
                <Input type="date" placeholder="Any date" value={f.from} onChange={(e) => set({ from: e.target.value })} />
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                To
                <Input type="date" placeholder="Any date" value={f.to} onChange={(e) => set({ to: e.target.value })} />
              </label>
            </div>
          </form>

          {pending && entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Nothing recorded matches.</p>
          ) : (
            <ol className={cn("grid gap-1", pending && "opacity-60")}>
              {entries.map((e, i) => {
                const day = dayOf(e.created_at);
                const header = i === 0 || dayOf(entries[i - 1].created_at) !== day ? day : null;
                return (
                  <li key={e.id} className="grid gap-1">
                    {header && <h2 className="mt-3 text-sm font-semibold text-muted-foreground">{header}</h2>}
                    <div className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
                      <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{timeOf(e.created_at)}</span>
                      <span className="min-w-0 flex-1 break-words">
                        <span className="font-semibold">{e.actor_name}</span> {describeAudit(e)}
                        {e.project_name && e.entity !== "project" && <span className="block text-xs text-muted-foreground">{e.project_name}</span>}
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize", TONE[e.action] ?? TONE.updated)}>{e.action}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {more && (
            <Button variant="outline" className="justify-self-center" disabled={pending} onClick={() => load(f, true)}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} Show older
            </Button>
          )}
        </>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Tasks deleted in the last 30 days, with their checklist, comments, files and people. Restore puts the task back where it was (or in the project&apos;s first group if its group was deleted too).
          </p>
          {binList.length === 0 ? (
            <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
              <Trash2 className="size-6" aria-hidden /> The recycle bin is empty.
            </p>
          ) : (
            <ul className="grid gap-2">
              {binList.map((b) => (
                <li key={b.task_id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                  <span className="min-w-0 flex-1 basis-52 text-sm">
                    <span className="block break-words font-semibold">{b.title}</span>
                    <span className="block text-muted-foreground">
                      {[b.project_name, b.group_name].filter(Boolean).join(" · ")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Deleted by {b.deleted_by_name ?? "someone"} · {when(b.deleted_at)}
                      {b.checklist || b.comments ? ` · ${b.checklist} checklist steps, ${b.comments} comments` : ""}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    disabled={restoring === b.task_id}
                    onClick={async () => {
                      if (!(await confirm(`Restore “${b.title}”?`, { body: `It goes back into ${b.project_name ?? "its project"}.`, confirmLabel: "Restore", tone: "safe" }))) return;
                      setRestoring(b.task_id);
                      const res = await restoreTask(b.task_id);
                      setRestoring(null);
                      if (!res.ok) return void toast.error(res.error);
                      setBinList((l) => l.filter((x) => x.task_id !== b.task_id));
                      toast.success("Task restored", { action: { label: "Open", onClick: () => router.push(`/projects/${b.project_id}/board?task=${b.task_id}`) } });
                    }}
                  >
                    {restoring === b.task_id ? <Loader2 className="animate-spin" aria-hidden /> : <ArchiveRestore aria-hidden />} Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Deleted a whole project? Its tasks can&apos;t be restored here — see the <Link href="/help#admin" className="underline">Help</Link> on backups.
          </p>
        </div>
      )}
    </div>
  );
}
