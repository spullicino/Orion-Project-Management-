"use client";

import { Download, FileDiff, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDate } from "@/lib/utils";
import { VARIATION_APPROVAL, voNumber, type BoardTask, type VariationApproval } from "@/types/board";
import { useBoard } from "./board-context";
import { StatusPill } from "./cells";
import { ApprovalPill, VariationDialog } from "./variations";

const baseTitle = (t: string) => t.replace(/^VO-\d+ · /, "");

/** Project → Variations: every VO with what changed, who asked, the client's approval and progress. */
export function VariationsView() {
  const { board, perms, openTask, labelsById } = useBoard();
  const [show, setShow] = useState<"all" | VariationApproval>("all");
  const [creating, setCreating] = useState(false);
  const all = useMemo(() => board.tasks.filter((t) => t.variation_no != null).sort((a, b) => (a.variation_no ?? 0) - (b.variation_no ?? 0)), [board.tasks]);
  const list = show === "all" ? all : all.filter((t) => (t.variation_approval ?? "pending") === show);
  const byId = useMemo(() => new Map(board.tasks.map((t) => [t.id, t])), [board.tasks]);
  const count = (a: VariationApproval) => all.filter((t) => (t.variation_approval ?? "pending") === a).length;
  const statusName = (t: BoardTask) => (t.status_id ? labelsById.get(t.status_id)?.name : undefined) ?? (t.completed_at ? "Done" : "");

  const exportXlsx = async () => {
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const head = ["VO", "Name", "Variation of", "What changed", "Requested by", "Requested on", "Client approval", "Status", "Progress %", "Due"].map((value) => ({ value, fontWeight: "bold" as const }));
      const rows = all.map((t) => [
        { value: voNumber(t.variation_no!) },
        { value: baseTitle(t.title) },
        { value: t.variation_of ? (byId.get(t.variation_of)?.title ?? "(deleted task)") : "" },
        { value: t.variation_reason ?? "", wrap: true },
        { value: t.variation_requested_by ?? "" },
        t.variation_requested_on ? { value: new Date(`${t.variation_requested_on}T12:00:00Z`), format: "dd/mm/yyyy" } : null,
        { value: VARIATION_APPROVAL[t.variation_approval ?? "pending"].label },
        { value: statusName(t) },
        { value: t.progress },
        t.due_date ? { value: new Date(`${t.due_date}T12:00:00Z`), format: "dd/mm/yyyy" } : null,
      ]);
      const slug = board.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      await writeXlsxFile([head, ...rows], {
        sheet: "Variations",
        stickyRowsCount: 1,
        columns: [{ width: 9 }, { width: 34 }, { width: 30 }, { width: 50 }, { width: 22 }, { width: 13 }, { width: 24 }, { width: 16 }, { width: 11 }, { width: 12 }],
      }).toFile(`${slug}-variations.xlsx`);
    } catch {
      toast.error("Couldn't create the Excel file. Please try again.");
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-48 sm:flex-none sm:basis-64">
          <NativeSelect value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show">
            <option value="all">All variations ({all.length})</option>
            <option value="pending">Awaiting client approval ({count("pending")})</option>
            <option value="approved">Approved ({count("approved")})</option>
            <option value="rejected">Rejected ({count("rejected")})</option>
          </NativeSelect>
        </div>
        {all.length > 0 && (
          <Button variant="outline" onClick={() => void exportXlsx()}>
            <Download aria-hidden /> Export to Excel
          </Button>
        )}
        {perms.canManage && (
          <Button className="sm:ml-auto" onClick={() => setCreating(true)}>
            <Plus aria-hidden /> New variation
          </Button>
        )}
      </div>

      {all.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <FileDiff className="size-8" aria-hidden />
          <p>No variations yet.</p>
          <p className="max-w-md text-sm">
            When the client changes something that&apos;s already done, open that task and tap <strong>Client change → Variation</strong>. The original stays Done and the extra work becomes VO-001 here.
          </p>
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">None with this approval.</p>
      ) : (
        <ul className="grid gap-2">
          {list.map((t) => {
            const original = t.variation_of ? byId.get(t.variation_of) : null;
            return (
              <li key={t.id}>
                <button type="button" onClick={() => openTask(t.id)} className="grid w-full gap-1.5 rounded-xl border bg-card p-4 text-left hover:bg-accent/40">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{voNumber(t.variation_no!)}</span>
                    <ApprovalPill approval={t.variation_approval} />
                    {t.status_id && <StatusPill label={labelsById.get(t.status_id)} className="h-6 px-2 text-xs" />}
                    <span className="text-sm tabular-nums text-muted-foreground">{t.progress}%</span>
                  </span>
                  <span className="break-words font-medium">{baseTitle(t.title)}</span>
                  {t.variation_reason && <span className="line-clamp-2 break-words text-sm text-muted-foreground">{t.variation_reason}</span>}
                  <span className="text-xs text-muted-foreground">
                    {[
                      original ? `Variation of: ${original.title}` : t.variation_of ? "Variation of a deleted task" : "Extra work",
                      t.variation_requested_by ? `asked by ${t.variation_requested_by}` : null,
                      t.variation_requested_on ? formatDate(t.variation_requested_on) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <VariationDialog source={null} onClose={() => setCreating(false)} />}
    </div>
  );
}
