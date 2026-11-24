"use client";

import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { loadMaterialReport } from "@/app/(app)/materials/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { shortDate } from "@/lib/board";
import { downloadReportCsv, downloadReportPdf } from "@/lib/materials/report";
import type { ReportLine } from "@/types/materials";

const qty = (n: number) =>
  Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** A project's materials report: what was delivered, per product, for a period. */
export function MaterialReport({
  projectId,
  projectName,
  loader = loadMaterialReport,
}: {
  projectId: string;
  projectName: string;
  loader?: typeof loadMaterialReport;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [lines, setLines] = useState<ReportLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show "loading" while the new period loads
    setLines(null);
    void loader(projectId, from || null, to || null).then((r) => {
      if (!live) return;
      if (r.ok) {
        setLines(r.data ?? []);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [projectId, from, to, loader]);

  const categories = useMemo(
    () => [...new Set((lines ?? []).map((l) => l.category ?? "Other"))].sort(),
    [lines],
  );
  const shown = useMemo(
    () =>
      (lines ?? []).filter(
        (l) => !category || (l.category ?? "Other") === category,
      ),
    [lines, category],
  );
  const meta = {
    projectName,
    from: from || null,
    to: to || null,
    category: category || null,
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 basis-32 gap-1 sm:flex-none text-sm font-medium">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full sm:w-44"
          />
        </label>
        <label className="grid min-w-0 flex-1 basis-32 gap-1 sm:flex-none text-sm font-medium">
          To
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="w-full sm:w-44"
          />
        </label>
        {categories.length > 1 && (
          <label className="grid gap-1 text-sm font-medium">
            Category
            <NativeSelect
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!lines}
            onClick={() =>
              void downloadReportPdf(shown, meta).catch(() =>
                toast.error("Couldn't make the PDF."),
              )
            }
          >
            <FileDown aria-hidden /> PDF
          </Button>
          <Button
            variant="outline"
            disabled={!lines}
            onClick={() => downloadReportCsv(shown, meta)}
          >
            <FileSpreadsheet aria-hidden /> Excel (CSV)
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : !lines ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          {from || to
            ? "Nothing was delivered to this project in this period."
            : "Nothing has been delivered to this project yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Materials delivered to this project
            </caption>
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">Product</th>
                <th className="hidden p-3 font-semibold sm:table-cell">
                  Category
                </th>
                <th className="p-3 text-right font-semibold">Delivered</th>
                <th className="hidden p-3 text-right font-semibold md:table-cell">
                  Requested
                </th>
                <th className="hidden p-3 font-semibold md:table-cell">
                  Last delivery
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((l) => (
                <tr key={`${l.product_id ?? l.name}|${l.unit}`}>
                  <td className="p-3">
                    <span className="font-medium">{l.name}</span>
                    {!l.in_catalogue && (
                      <span className="block text-xs text-muted-foreground">
                        Typed by hand
                      </span>
                    )}
                  </td>
                  <td className="hidden p-3 text-muted-foreground sm:table-cell">
                    {l.category ?? "—"}
                  </td>
                  <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">
                    {qty(l.delivered)} {l.unit}
                  </td>
                  <td className="hidden whitespace-nowrap p-3 text-right tabular-nums text-muted-foreground md:table-cell">
                    {qty(l.requested)} {l.unit}
                  </td>
                  <td className="hidden p-3 text-muted-foreground md:table-cell">
                    {l.last_delivered ? shortDate(l.last_delivered) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
