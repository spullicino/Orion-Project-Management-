import { ArrowRight, Headset } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { slaInfo, ticketRef } from "@/lib/aftersales";
import type { MyTicket } from "@/lib/data/aftersales";
import { PriorityPill, SlaPill, StatusPill } from "./pills";

/** "My tickets": open Aftersales tickets assigned to me, most urgent first (My Tasks and Home). */
export function MyTickets({ tickets, nowMs, limit, className }: { tickets: MyTicket[]; nowMs: number; limit?: number; className?: string }) {
  if (!tickets.length) return null;
  const shown = limit ? tickets.slice(0, limit) : tickets;
  const overdue = tickets.filter((t) => slaInfo(t, nowMs)?.overdue).length;
  return (
    <Card className={className}>
      <CardContent className="grid gap-3 p-4 md:p-5">
        <Link href="/aftersales?view=mine" className="flex items-center gap-3 rounded-lg">
          <Headset className="size-6 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold leading-tight">My tickets</span>
            <span className="block text-sm text-muted-foreground">
              {tickets.length} open Aftersales {tickets.length === 1 ? "ticket" : "tickets"}
              {overdue > 0 && <span className="font-semibold text-destructive"> · {overdue} overdue</span>}
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
        <ul className="grid divide-y overflow-hidden rounded-xl border">
          {shown.map((t) => (
            <li key={t.number}>
              <Link href={`/aftersales/tickets/${t.number}`} className="grid gap-1 p-3 hover:bg-accent/50">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">{ticketRef(t.number)}</span>
                  <span className="min-w-0 truncate font-medium">{t.subject}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <StatusPill status={t.status} />
                  <PriorityPill priority={t.priority} hideNormal />
                  <SlaPill info={slaInfo(t, nowMs)} />
                  {(t.customer || t.site) && <span className="min-w-0 truncate text-muted-foreground">{[t.customer, t.site].filter(Boolean).join(" · ")}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {limit && tickets.length > limit && (
          <Link href="/aftersales?view=mine" className="justify-self-start text-sm font-medium text-primary hover:underline">
            See all {tickets.length} tickets
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
