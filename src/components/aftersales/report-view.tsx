"use client";

import { Download, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { TICKET_PRIORITY, TICKET_STATUS } from "@/lib/aftersales";
import { buildReport, pct, reportRow, type ReportLine, type ReportTicket } from "@/lib/aftersales-report";

const monthLabel = (ym: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T12:00:00Z`));

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl border bg-card p-3">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Lines({ title, lines }: { title: string; lines: ReportLine[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Name</th>
              <th className="px-2 py-2 text-right font-medium">Tickets</th>
              <th className="px-2 py-2 text-right font-medium">First reply on time</th>
              <th className="px-2 py-2 text-right font-medium">Fixed on time</th>
              <th className="py-2 pl-2 text-right font-medium">Still open</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.name} className="border-b last:border-0">
                <td className="py-2 pr-2 font-medium">{l.name}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.tickets}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {pct(l.firstOn, l.firstLate)} <span className="text-xs text-muted-foreground">({l.firstLate} late)</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {pct(l.fixOn, l.fixLate)} <span className="text-xs text-muted-foreground">({l.fixLate} late)</span>
                </td>
                <td className="py-2 pl-2 text-right tabular-nums">{l.open}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function ReportView({ month, months, tickets, nowMs }: { month: string; months: string[]; tickets: ReportTicket[]; nowMs: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const r = buildReport(tickets, nowMs);

  const exportXlsx = async () => {
    setBusy(true);
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const head = ["Ticket", "Subject", "Customer", "Category", "Priority", "Status", "Assigned to", "Opened", "First reply", "First reply", "Resolved", "Fixed"].map((value) => ({
        value,
        fontWeight: "bold" as const,
      }));
      const date = (iso: string | null) => (iso ? { value: new Date(iso), format: "dd/mm/yyyy hh:mm" } : null);
      const rows = tickets.map((t) => {
        const w = reportRow(t, nowMs);
        return [
          { value: w.ref },
          { value: t.subject },
          { value: t.customer ?? "" },
          { value: t.category ?? "" },
          { value: TICKET_PRIORITY[t.priority].label },
          { value: TICKET_STATUS[t.status].label },
          { value: t.assignee ?? "" },
          date(t.created_at),
          date(t.first_response_at),
          { value: w.firstWord },
          date(t.resolved_at),
          { value: w.fixWord },
        ];
      });
      await writeXlsxFile([head, ...rows], {
        sheet: monthLabel(month),
        stickyRowsCount: 1,
        columns: [{ width: 11 }, { width: 40 }, { width: 26 }, { width: 16 }, { width: 9 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 9 }, { width: 16 }, { width: 9 }],
      }).toFile(`aftersales-${month}.xlsx`);
    } catch {
      toast.error("Couldn't make the Excel file. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Month" className="w-auto min-w-0 flex-1 sm:flex-none" value={month} onChange={(e) => router.push(`${pathname}?month=${e.target.value}`)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </NativeSelect>
        <Button variant="outline" onClick={exportXlsx} disabled={busy || !tickets.length}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} Excel
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Tickets opened in {monthLabel(month)}. On time = within the response targets in Settings (working hours, not counting time waiting for the customer).</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Tickets" value={String(r.total.tickets)} hint={`${r.byStatus.resolved + r.byStatus.closed} resolved or closed`} />
        <Tile label="First reply on time" value={pct(r.total.firstOn, r.total.firstLate)} hint={`${r.total.firstLate} late`} />
        <Tile label="Fixed on time" value={pct(r.total.fixOn, r.total.fixLate)} hint={`${r.total.fixLate} late`} />
        <Tile label="Still open" value={String(r.total.open)} />
      </div>
      {tickets.length ? (
        <>
          <Lines title="By person" lines={r.people} />
          <Lines title="By category" lines={r.categories} />
        </>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No tickets were opened in {monthLabel(month)}.</p>
      )}
    </div>
  );
}
