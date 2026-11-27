"use client";

import { Mail, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { slaInfo, TICKET_PRIORITIES, TICKET_PRIORITY, TICKET_VIEWS, ticketRef, type TicketView } from "@/lib/aftersales";
import { cn } from "@/lib/utils";
import type { AsCategory, TicketRow } from "@/types/aftersales";
import { PriorityPill, SlaPill, StatusPill } from "./pills";

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("en-GB", same ? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" } : { day: "numeric", month: "short", timeZone: "Europe/Malta" }).format(d);
};

export function TicketFilters({ view, categories, counts }: { view: TicketView; categories: AsCategory[]; counts: Partial<Record<TicketView, number>> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}${next.size ? `?${next}` : ""}`);
  };
  return (
    <div className="grid gap-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="tablist" aria-label="Which tickets">
        {TICKET_VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={view === v.value}
            onClick={() => go({ view: v.value === "open" ? null : v.value })}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
              view === v.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {v.label}
            {counts[v.value] != null && <span className={cn("text-xs", view === v.value ? "opacity-90" : "text-muted-foreground")}>{counts[v.value]}</span>}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_10rem]">
        <form
          className="relative"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() || null });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OGT number, subject, customer or site" aria-label="Search tickets" className="pl-9" enterKeyHint="search" />
        </form>
        <NativeSelect aria-label="Category" value={params.get("category") ?? ""} onChange={(e) => go({ category: e.target.value || null })}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Priority" value={params.get("priority") ?? ""} onChange={(e) => go({ priority: e.target.value || null })}>
          <option value="">All priorities</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TICKET_PRIORITY[p].label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

export function TicketList({ tickets, empty, nowMs }: { tickets: TicketRow[]; empty: string; nowMs: number }) {
  if (!tickets.length) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid divide-y overflow-hidden rounded-xl border bg-card">
      {tickets.map((t) => (
        <li key={t.id}>
          <Link href={`/aftersales/tickets/${t.number}`} className="grid gap-1 p-3 hover:bg-accent/50 md:px-4">
            <span className="flex min-w-0 items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-muted-foreground">
                  {ticketRef(t.number)}
                  {t.category && ` · ${t.category}`}
                </span>
                <span className="block break-words font-medium">{t.subject}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{when(t.updated_at)}</span>
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <StatusPill status={t.status} />
              <PriorityPill priority={t.priority} hideNormal />
              <SlaPill info={slaInfo(t, nowMs)} />
              {t.source === "email" && <Mail className="size-4 text-muted-foreground" aria-label="From an email" />}
              <span className="min-w-0 truncate text-muted-foreground">{[t.customer, t.site].filter(Boolean).join(" · ") || "No customer yet"}</span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                <UserRound className="size-3.5" aria-hidden /> {t.assignee ?? "Not assigned"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
