"use client";

import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { listSwitchableProjects, type SwitchProject } from "@/app/(app)/projects/switcher-actions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Jump to another project, staying on the same tab (Board, Gantt, Diary…). */
export function ProjectSwitcher({ currentId }: { currentId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<SwitchProject[] | null>(null);
  const [q, setQ] = useState("");
  // /projects/<id>/<tab>/… → <tab>
  const tab = pathname.split("/")[3] || "board";

  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    const list = projects ?? [];
    return w ? list.filter((p) => p.name.toLowerCase().includes(w) || (p.code ?? "").toLowerCase().includes(w)) : list;
  }, [projects, q]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setQ("");
          if (!projects) void listSwitchableProjects().then(setProjects);
        }}
        aria-label="Switch to another project"
        title="Switch project"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ChevronsUpDown className="size-4" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Switch project" description={`Opens the same tab (${tab.replace(/-/g, " ")}) in the project you choose.`} className="max-w-lg">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a project" aria-label="Find a project" className="pl-9" />
          </div>
          {projects === null ? (
            <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
            </p>
          ) : (
            <ul className="grid max-h-[55dvh] gap-0.5 overflow-y-auto">
              {shown.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={p.id === currentId}
                    onClick={() => {
                      setOpen(false);
                      router.push(`/projects/${p.id}/${tab}`);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent disabled:cursor-default disabled:bg-primary/5"
                  >
                    <span className="size-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      {(p.code || p.status !== "active") && (
                        <span className="block truncate text-xs text-muted-foreground">{[p.code, p.status !== "active" ? p.status.replace("_", " ") : null].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                    {p.id === currentId && <Check className="size-4 shrink-0 text-primary" aria-label="You're here" />}
                  </button>
                </li>
              ))}
              {!shown.length && <li className="p-3 text-sm text-muted-foreground">No project matches “{q}”.</li>}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
