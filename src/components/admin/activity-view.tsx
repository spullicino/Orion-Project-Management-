"use client";

import { BellOff, BellRing, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { activityLevel, lastSeenLabel, lastUpdateLabel, type ActivityLevel } from "@/lib/activity/format";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { cn, fullName } from "@/lib/utils";
import type { AppRole } from "@/types/database";

export type ActivityPerson = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  avatar_src?: string | null;
  role: AppRole;
  status: "active" | "deactivated" | "pending";
  last_seen_at: string | null;
  last_update: string | null;
  push_on: boolean;
  projects: string[];
};

const DOT: Record<ActivityLevel, { cls: string; label: string }> = {
  today: { cls: "bg-emerald-500", label: "Active today" },
  recent: { cls: "bg-slate-400", label: "Active in the last 2 days" },
  quiet: { cls: "bg-amber-500", label: "Not seen for 3+ days" },
  inactive: { cls: "bg-red-500", label: "Not seen for a week or more" },
};

type Show = "all" | "week" | "never" | "push";

export function ActivityView({ people, now }: { people: ActivityPerson[]; now: number }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [role, setRole] = useState<"" | AppRole>("");

  const active = useMemo(() => people.filter((p) => p.status === "active"), [people]);
  const counts = useMemo(
    () => ({
      today: active.filter((p) => activityLevel(p.last_seen_at, now) === "today").length,
      week: active.filter((p) => ["quiet", "inactive"].includes(activityLevel(p.last_seen_at, now)) || !p.last_seen_at).length,
      push: active.filter((p) => !p.push_on).length,
    }),
    [active, now],
  );
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return active.filter((p) => {
      if (role && p.role !== role) return false;
      const lvl = activityLevel(p.last_seen_at, now);
      if (show === "week" && !(lvl === "quiet" || lvl === "inactive")) return false;
      if (show === "never" && p.last_seen_at) return false;
      if (show === "push" && p.push_on) return false;
      const hay = `${fullName(p)} ${p.email} ${p.projects.join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [active, q, show, role, now]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <button type="button" onClick={() => setShow("all")} className="rounded-xl bg-emerald-100 p-3 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
          <span className="block text-2xl font-bold tabular-nums">{counts.today}</span>
          <span className="block text-xs font-medium">Active today</span>
        </button>
        <button type="button" onClick={() => setShow("week")} className={cn("rounded-xl p-3", counts.week ? "bg-destructive/10 text-destructive" : "bg-muted")}>
          <span className="block text-2xl font-bold tabular-nums">{counts.week}</span>
          <span className="block text-xs font-medium">Not this week</span>
        </button>
        <button type="button" onClick={() => setShow("push")} className={cn("rounded-xl p-3", counts.push ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "bg-muted")}>
          <span className="block text-2xl font-bold tabular-nums">{counts.push}</span>
          <span className="block text-xs font-medium">Notifications off</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people or projects" aria-label="Search people or projects" className="pl-9" />
        </div>
        <div className="min-w-0 flex-1 basis-40 sm:flex-none sm:basis-52">
          <NativeSelect value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show">
            <option value="all">Everyone</option>
            <option value="week">Not active this week</option>
            <option value="never">Never opened the app</option>
            <option value="push">Notifications off</option>
          </NativeSelect>
        </div>
        <div className="min-w-0 flex-1 basis-32 sm:flex-none sm:basis-44">
          <NativeSelect value={role} onChange={(e) => setRole(e.target.value as "" | AppRole)} aria-label="Level">
            <option value="">All levels</option>
            {(["admin", "manager", "technician", "basic"] as AppRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {shown.length} {shown.length === 1 ? "person" : "people"} · least active first. &ldquo;Last active&rdquo; is when they last opened the app.
      </p>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Nobody matches.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {shown.map((p) => {
            const lvl = activityLevel(p.last_seen_at, now);
            return (
              <li key={p.id} className="flex items-start gap-3 p-3">
                <span className="relative shrink-0">
                  <UserAvatar person={p} src={p.avatar_src} size={40} />
                  <span className={cn("absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-card", DOT[lvl].cls)} title={DOT[lvl].label} aria-label={DOT[lvl].label} role="img" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{fullName(p)}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {ROLE_LABEL[p.role]}
                    </Badge>
                  </span>
                  <span className={cn(lvl === "inactive" ? "font-medium text-destructive" : lvl === "quiet" ? "font-medium text-amber-700 dark:text-amber-400" : "text-foreground")}>
                    Last active: {lastSeenLabel(p.last_seen_at, now)}
                  </span>
                  {(p.role === "technician" || p.last_update) && (
                    <span className="text-muted-foreground">Last daily update: {lastUpdateLabel(p.last_update, now)}</span>
                  )}
                  <span className="truncate text-muted-foreground">{p.projects.length ? p.projects.join(", ") : "Not on any active project"}</span>
                </span>
                <span
                  className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", p.push_on ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100")}
                  title={p.push_on ? "Phone notifications are on" : "Phone notifications are off"}
                >
                  {p.push_on ? <BellRing className="size-3.5" aria-hidden /> : <BellOff className="size-3.5" aria-hidden />}
                  <span className="hidden sm:inline">{p.push_on ? "On" : "Off"}</span>
                  <span className="sr-only sm:hidden">{p.push_on ? "Notifications on" : "Notifications off"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
