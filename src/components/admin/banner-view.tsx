"use client";

import { ArrowDown, ArrowUp, Loader2, Pause, Pencil, Play, Plus, Search, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteBanner, endBanner, moveBanner, saveBanner, setBannerPaused } from "@/app/(app)/admin/banner/actions";
import { BannerStrip } from "@/components/layout/top-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { BANNER_DURATIONS, BANNER_TONES, bannerRange, bannerState, isNotifyBanner, NOTIFY_LINK, type BannerDuration, type BannerState, type BannerTone } from "@/lib/banner";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/database";
import { Chip } from "./messages-view";

export type AdminBanner = {
  id: string;
  body: string;
  link: string | null;
  tone: BannerTone;
  starts_at: string;
  ends_at: string | null;
  paused: boolean;
  audience_type: "everyone" | "levels" | "projects" | "people";
  audience_roles: AppRole[];
  audience_projects: string[];
  audience_people: string[];
  author: string;
};
type Person = { id: string; name: string; role: AppRole };
type AudienceType = AdminBanner["audience_type"];

const ROLES: AppRole[] = ["technician", "manager", "basic", "admin"];
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));
const pad = (n: number) => String(n).padStart(2, "0");
const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const STATE_LABEL: Record<BannerState, { label: string; tone: string }> = {
  showing: { label: "Showing now", tone: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300" },
  scheduled: { label: "Scheduled", tone: "bg-sky-600/15 text-sky-800 dark:text-sky-300" },
  paused: { label: "Paused", tone: "bg-muted text-muted-foreground" },
  ended: { label: "Ended", tone: "bg-muted text-muted-foreground" },
};

function BannerForm({
  editing,
  people,
  projects,
  onDone,
}: {
  editing: AdminBanner | null;
  people: Person[];
  projects: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const start = editing ? new Date(editing.starts_at) : null;
  const end = editing?.ends_at ? new Date(editing.ends_at) : null;
  const future = !!start && start > new Date();
  const [body, setBody] = useState(editing?.body ?? "");
  const [tap, setTap] = useState<"none" | "link" | "notify">(isNotifyBanner(editing?.link) ? "notify" : editing?.link ? "link" : "none");
  const [link, setLink] = useState(isNotifyBanner(editing?.link) ? "" : (editing?.link ?? ""));
  const savedLink = tap === "notify" ? NOTIFY_LINK : tap === "link" ? link : "";
  const [tone, setTone] = useState<BannerTone>(editing?.tone ?? "info");
  const [duration, setDuration] = useState<BannerDuration>(editing ? (future ? "range" : end ? "until" : "forever") : "1w");
  const [fromDate, setFromDate] = useState(start && future ? dateOf(start) : dateOf(new Date()));
  const [fromTime, setFromTime] = useState(start && future ? timeOf(start) : "07:00");
  const [toDate, setToDate] = useState(end && end > new Date() ? dateOf(end) : "");
  const [toTime, setToTime] = useState(end && end > new Date() ? timeOf(end) : "17:00");
  const [type, setType] = useState<AudienceType>(editing?.audience_type ?? "everyone");
  const [roles, setRoles] = useState<AppRole[]>(editing?.audience_roles.length ? editing.audience_roles : ["technician"]);
  const [projectIds, setProjectIds] = useState<string[]>(editing?.audience_projects ?? []);
  const [userIds, setUserIds] = useState<string[]>(editing?.audience_people ?? []);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const range = bannerRange(duration, new Date(), { fromDate, fromTime, toDate, toTime });
  const rangeText =
    "error" in range
      ? null
      : range.endsAt
        ? `${duration === "range" ? `Starts ${when(range.startsAt.toISOString())} · ` : "Shows now "}until ${when(range.endsAt.toISOString())}`
        : "Shows now until you end or delete it";
  const shownPeople = useMemo(() => {
    const w = q.trim().toLowerCase();
    return w ? people.filter((p) => p.name.toLowerCase().includes(w)) : people;
  }, [people, q]);
  const audienceOk = type === "everyone" || (type === "levels" ? roles.length : type === "projects" ? projectIds.length : userIds.length);
  const ready = body.trim() && !("error" in range) && audienceOk && (tap !== "link" || link.trim());

  async function submit() {
    if ("error" in range) return void toast.error(range.error);
    // Editing one that already started: keep its original start.
    const startsAt = editing && duration !== "range" && start && start <= new Date() ? start : range.startsAt;
    const audience =
      type === "everyone" ? { type } : type === "levels" ? { type, roles } : type === "projects" ? { type, projectIds } : { type, userIds };
    setBusy(true);
    const res = await saveBanner(editing?.id ?? null, {
      body,
      link: savedLink,
      tone,
      startsAt: startsAt.toISOString(),
      endsAt: range.endsAt?.toISOString() ?? null,
      audience,
    } as Parameters<typeof saveBanner>[1]);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(editing ? "Saved" : "Added to the banner");
    router.refresh();
    onDone();
  }

  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        <h2 className="text-base font-semibold">{editing ? "Edit banner message" : "New banner message"}</h2>
        <label className="grid gap-1 text-sm font-medium">
          Message
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={200} rows={2} placeholder="e.g. Toolbox talk on Monday at 7:30 in the yard" />
          <span className="justify-self-end text-xs font-normal text-muted-foreground">{body.length}/200</span>
        </label>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Type</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BANNER_TONES) as BannerTone[]).map((t) => (
              <Chip key={t} on={tone === t} onClick={() => setTone(t)}>
                {BANNER_TONES[t].label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">When tapped</legend>
          <div className="flex flex-wrap gap-2">
            <Chip on={tap === "none"} onClick={() => setTap("none")}>
              Nothing (information only)
            </Chip>
            <Chip on={tap === "link"} onClick={() => setTap("link")}>
              Open a link
            </Chip>
            <Chip
              on={tap === "notify"}
              onClick={() => {
                setTap("notify");
                if (!body.trim()) setBody("Turn on notifications so you don't miss tasks and messages — tap here");
              }}
            >
              Turn on notifications
            </Chip>
          </div>
          {tap === "none" ? (
            <p className="text-sm text-muted-foreground">People just read it — tapping it does nothing.</p>
          ) : tap === "link" ? (
            <label className="grid gap-1 text-sm font-medium">
              <span className="sr-only">Link</span>
              <Input value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="https://… or a page in the app, e.g. /projects" inputMode="url" aria-label="Link" />
              <span className="text-xs font-normal text-muted-foreground">Tapping the banner opens it.</span>
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tapping it turns on notifications for that phone or computer — the phone asks <strong>Allow</strong>, and it&apos;s saved. People who already have notifications on don&apos;t see this message (that may include you). On iPhones not added to the Home Screen it shows them how instead.
            </p>
          )}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">How long it shows</legend>
          <NativeSelect value={duration} onChange={(e) => setDuration(e.target.value as BannerDuration)} aria-label="How long it shows">
            {BANNER_DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </NativeSelect>
          {duration === "range" && (
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
                Starts on
                <Input type="date" value={fromDate} min={dateOf(new Date())} onChange={(e) => setFromDate(e.target.value)} />
              </label>
              <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
                at
                <Input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
              </label>
            </div>
          )}
          {(duration === "range" || duration === "until") && (
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
                Ends on
                <Input type="date" value={toDate} min={duration === "range" ? fromDate : dateOf(new Date())} onChange={(e) => setToDate(e.target.value)} />
              </label>
              <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
                at
                <Input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
              </label>
            </div>
          )}
          <p className={cn("text-sm", "error" in range ? "text-destructive" : "text-muted-foreground")}>{"error" in range ? range.error : rangeText}</p>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Who sees it</legend>
          <NativeSelect value={type} onChange={(e) => setType(e.target.value as AudienceType)} aria-label="Who sees it">
            <option value="everyone">Everyone</option>
            <option value="levels">By level (e.g. technicians)</option>
            <option value="projects">People on chosen projects</option>
            <option value="people">Chosen people</option>
          </NativeSelect>
          {type === "levels" && (
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <Chip key={r} on={roles.includes(r)} onClick={() => setRoles(toggle(roles, r))}>
                  {ROLE_LABEL[r]}
                </Chip>
              ))}
            </div>
          )}
          {type === "projects" && (
            <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border p-1">
              {projects.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent">
                    <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={projectIds.includes(p.id)} onChange={() => setProjectIds(toggle(projectIds, p.id))} />
                    <span className="min-w-0 truncate text-sm">{p.name}</span>
                  </label>
                </li>
              ))}
              {!projects.length && <li className="p-3 text-sm text-muted-foreground">No active projects.</li>}
            </ul>
          )}
          {type === "people" && (
            <div className="grid gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" className="pl-9" />
              </div>
              <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border p-1">
                {shownPeople.map((p) => (
                  <li key={p.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-accent">
                      <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={userIds.includes(p.id)} onChange={() => setUserIds(toggle(userIds, p.id))} />
                      <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[p.role]}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{userIds.length} chosen</p>
            </div>
          )}
        </fieldset>

        <div className="grid gap-1">
          <span className="text-sm font-medium">Preview</span>
          <div className="overflow-hidden rounded-xl border">
            <BannerStrip item={{ body, link: savedLink || null, tone }} preview />
          </div>
          <p className="text-xs text-muted-foreground">With more than one message, they take turns every 7 seconds. People can&apos;t close it.</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {editing && (
            <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={submit} disabled={busy || !ready}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : editing ? <Pencil aria-hidden /> : <Plus aria-hidden />}
            {editing ? "Save changes" : "Add to banner"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function BannerView({ banners, people, projects }: { banners: AdminBanner[]; people: Person[]; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<AdminBanner | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const names = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const now = new Date();
  const withState = banners.map((b) => ({ ...b, state: bannerState(b, now) }));
  const live = withState.filter((b) => b.state !== "ended");
  const ended = withState.filter((b) => b.state === "ended");

  const who = (b: AdminBanner) => {
    const list = (ids: string[], m: Map<string, string>) => {
      const n = ids.map((id) => m.get(id) ?? "someone");
      return n.length > 3 ? `${n.slice(0, 3).join(", ")} +${n.length - 3}` : n.join(", ");
    };
    if (b.audience_type === "everyone") return "Everyone";
    if (b.audience_type === "levels") return b.audience_roles.map((r) => ROLE_LABEL[r] + "s").join(", ");
    if (b.audience_type === "projects") return `People on ${list(b.audience_projects, projectNames)}`;
    return list(b.audience_people, names);
  };
  const timing = (b: AdminBanner & { state: BannerState }) =>
    b.state === "ended"
      ? `Ended ${b.ends_at ? when(b.ends_at) : ""}`
      : b.state === "scheduled"
        ? `Starts ${when(b.starts_at)}${b.ends_at ? ` · until ${when(b.ends_at)}` : ""}`
        : b.ends_at
          ? `Until ${when(b.ends_at)}`
          : "Until you remove it";

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
    if (ok) toast.success(ok);
    router.refresh();
  };

  const row = (b: AdminBanner & { state: BannerState }, i: number, list: unknown[]) => (
    <li key={b.id} className={cn("grid gap-2 rounded-xl border bg-card p-3", b.state === "ended" && "opacity-75")}>
      <div className="overflow-hidden rounded-lg">
        <BannerStrip item={b} preview />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold", STATE_LABEL[b.state].tone)}>{STATE_LABEL[b.state].label}</span>
        <span className="text-muted-foreground">{timing(b)}</span>
        <span className="min-w-0 text-muted-foreground">· {who(b)}</span>
        {b.link && <span className="min-w-0 truncate text-muted-foreground">· {isNotifyBanner(b.link) ? "Tap turns on notifications (hidden for people who have them on)" : `Link: ${b.link}`}</span>}
        <span className="text-xs text-muted-foreground">· by {b.author}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {b.state !== "ended" && (
          <>
            <Button size="sm" variant="outline" aria-label="Show earlier" disabled={!!busy || i === 0} onClick={() => run(b.id, () => moveBanner(b.id, -1))}>
              <ArrowUp aria-hidden />
            </Button>
            <Button size="sm" variant="outline" aria-label="Show later" disabled={!!busy || i === list.length - 1} onClick={() => run(b.id, () => moveBanner(b.id, 1))}>
              <ArrowDown aria-hidden />
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() => {
            setEditing(b);
            setFormKey((k) => k + 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <Pencil aria-hidden /> {b.state === "ended" ? "Show again" : "Edit"}
        </Button>
        {b.state !== "ended" && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(b.id, () => setBannerPaused(b.id, !b.paused), b.paused ? "Showing again" : "Paused")}>
            {busy === b.id ? <Loader2 className="animate-spin" aria-hidden /> : b.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            {b.paused ? "Resume" : "Pause"}
          </Button>
        )}
        {b.state !== "ended" && (
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={async () => {
              if (!(await confirm("End this message now?", { body: "It disappears from everyone's banner straight away. It stays in the list, so you can show it again.", confirmLabel: "End now", tone: "safe" }))) return;
              run(b.id, () => endBanner(b.id), "Ended");
            }}
          >
            <Square aria-hidden /> End now
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={!!busy}
          onClick={async () => {
            if (!(await confirm("Delete this banner message?", { body: "It's removed from the banner and from this list." }))) return;
            run(b.id, () => deleteBanner(b.id), "Deleted");
          }}
        >
          <Trash2 aria-hidden /> Delete
        </Button>
      </div>
    </li>
  );

  return (
    <div className="grid gap-6">
      {dialog}
      <BannerForm
        key={formKey}
        editing={editing}
        people={people}
        projects={projects}
        onDone={() => {
          setEditing(null);
          setFormKey((k) => k + 1);
        }}
      />
      <section className="grid gap-2">
        <h2 className="text-base font-semibold">In the banner ({live.length})</h2>
        <p className="text-sm text-muted-foreground">Shown in this order. Each person only sees the ones meant for them.</p>
        {live.length ? <ul className="grid gap-3">{live.map((b, i, l) => row(b, i, l))}</ul> : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nothing in the banner right now.</p>}
      </section>
      {ended.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-base font-semibold">Ended</h2>
          <ul className="grid gap-3">{ended.map((b, i, l) => row(b, i, l))}</ul>
        </section>
      )}
    </div>
  );
}
