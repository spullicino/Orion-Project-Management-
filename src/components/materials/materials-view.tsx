"use client";

import { Camera, MessageSquare, Package, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadMaterialRequests, loadProjectMaterials } from "@/app/(app)/materials/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { shortDate } from "@/lib/board";
import { chatTime } from "@/lib/chat";
import { cn, fullName } from "@/lib/utils";
import { OPEN_STATUSES, type MaterialListItem, type ProjectMaterial } from "@/types/materials";
import { MaterialDetail, StatusPill } from "./material-detail";
import { MaterialForm, type MaterialFormStart } from "./material-form";

type Project = { id: string; name: string };
const qty = (n: number) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 });

/**
 * Material requests: for one project (its Materials tab) or across all your projects.
 * `editable` = projects where you can request materials; `manageable` = where you handle them.
 */
export function MaterialsView({
  meId,
  projectId,
  initial,
  initialMaterials,
  editable,
  manageable,
  detailLoader,
}: {
  /** Development preview only. */
  detailLoader?: Parameters<typeof MaterialDetail>[0]["loader"];
  meId: string;
  projectId?: string;
  initial: MaterialListItem[];
  initialMaterials?: ProjectMaterial[];
  editable: Project[];
  manageable: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("request");
  const [list, setList] = useState(initial);
  const [materials, setMaterials] = useState(initialMaterials ?? []);
  const [tab, setTab] = useState<"requests" | "delivered">("requests");
  const [filter, setFilter] = useState<"open" | "all" | "mine">("open");
  const [projectFilter, setProjectFilter] = useState("");
  const [form, setForm] = useState<{ start: MaterialFormStart; projectId?: string; key: number } | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh server data replaces the list
  useEffect(() => setList(initial), [initial]);

  const reload = useCallback(async () => {
    const [res, mats] = await Promise.all([loadMaterialRequests(projectId ?? null), projectId ? loadProjectMaterials(projectId) : Promise.resolve(null)]);
    if (res.ok) setList(res.data ?? []);
    if (mats?.ok) setMaterials(mats.data ?? []);
  }, [projectId]);

  const openRequest = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("request", id);
    else next.delete("request");
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const shown = useMemo(
    () =>
      list.filter(
        (r) =>
          (filter === "all" || (filter === "open" ? OPEN_STATUSES.includes(r.status) : r.requested_by?.id === meId)) &&
          (!projectFilter || r.project.id === projectFilter),
      ),
    [list, filter, projectFilter, meId],
  );
  const projectsInList = useMemo(() => [...new Map(list.map((r) => [r.project.id, r.project])).values()].sort((a, b) => a.name.localeCompare(b.name)), [list]);
  const canRequest = projectId ? editable.some((p) => p.id === projectId) : editable.length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {projectId && (
          <div role="tablist" aria-label="Materials" className="inline-flex rounded-lg border bg-card p-0.5">
            {(
              [
                { k: "requests", label: "Requests" },
                { k: "delivered", label: "Delivered so far" },
              ] as const
            ).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn("h-11 rounded-md px-4 text-sm font-medium", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {canRequest && (
          <Button className="ml-auto" onClick={() => setForm({ start: { mode: "new" }, projectId, key: Date.now() })}>
            <Plus aria-hidden /> New request
          </Button>
        )}
      </div>

      {tab === "requests" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <div className="w-44">
              <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Show">
                <option value="open">Open requests</option>
                <option value="mine">My requests</option>
                <option value="all">All requests</option>
              </NativeSelect>
            </div>
            {!projectId && projectsInList.length > 1 && (
              <div className="w-56">
                <NativeSelect value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Project">
                  <option value="">All projects</option>
                  {projectsInList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="grid justify-items-center gap-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
              <Package className="size-8" aria-hidden />
              <p>{filter === "open" ? "No open material requests." : "No material requests yet."}</p>
              {canRequest && <p className="text-sm">Tap “New request” when you need something delivered to site.</p>}
            </div>
          ) : (
            <ul className="grid gap-2">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openRequest(r.id)}
                    className="grid w-full gap-1.5 rounded-xl border bg-card p-4 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">#{r.number}</span>
                      <StatusPill status={r.status} />
                      {r.urgent && <span className="inline-flex h-7 items-center rounded-full bg-red-600 px-3 text-xs font-semibold text-white">Urgent</span>}
                      {r.late && <span className="text-sm font-medium text-destructive">Late</span>}
                      {!projectId && (
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <span className="size-2.5 rounded-full" style={{ background: r.project.color }} aria-hidden /> {r.project.name}
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-2 text-sm">{r.summary}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{r.requested_by ? fullName(r.requested_by) : "Someone"} · {chatTime(r.created_at)}</span>
                      {r.needed_by && <span className={r.late ? "font-semibold text-destructive" : ""}>Needed by {shortDate(r.needed_by)}</span>}
                      {r.expected_date && OPEN_STATUSES.includes(r.status) && <span>Expected {shortDate(r.expected_date)}</span>}
                      {r.photo_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Camera className="size-3.5" aria-hidden /> {r.photo_count}
                        </span>
                      )}
                      {r.comment_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="size-3.5" aria-hidden /> {r.comment_count}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : materials.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Nothing has been delivered to this project yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">Materials delivered to this project</caption>
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">Material</th>
                <th className="p-3 text-right font-semibold">Delivered</th>
                <th className="hidden p-3 font-semibold sm:table-cell">Requests</th>
                <th className="p-3 font-semibold">Last</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {materials.map((m) => (
                <tr key={`${m.name}|${m.unit}`}>
                  <td className="p-3 font-medium">{m.name}</td>
                  <td className="p-3 text-right tabular-nums">
                    {qty(m.delivered)} {m.unit}
                  </td>
                  <td className="hidden p-3 text-muted-foreground sm:table-cell">{m.requests.map((n) => `#${n}`).join(", ")}</td>
                  <td className="p-3 text-muted-foreground">{m.last_delivered ? shortDate(m.last_delivered.slice(0, 10)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MaterialDetail
        requestId={openId}
        onClose={() => openRequest(null)}
        loader={detailLoader}
        me={{ id: meId, canManage: (p) => manageable.includes(p), canEdit: (p) => editable.some((x) => x.id === p) }}
        onChanged={() => void reload()}
        onEdit={(start, p) => setForm({ start, projectId: p, key: Date.now() })}
        onReorder={(start, p) => {
          openRequest(null);
          setForm({ start, projectId: p, key: Date.now() });
        }}
      />
      {form && (
        <MaterialForm
          key={form.key}
          open
          onClose={() => setForm(null)}
          projects={editable}
          projectId={form.projectId}
          start={form.start}
          onSaved={() => {
            setTimeout(() => void reload(), 1500); // give the outbox a moment to send it
            if (form.start.mode === "edit") void reload();
          }}
        />
      )}
    </div>
  );
}
