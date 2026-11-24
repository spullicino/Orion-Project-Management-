"use client";

import { Check, ChevronDown, Clock, Loader2, Megaphone, Search, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteAnnouncement, sendAnnouncement } from "@/app/(app)/admin/messages/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/database";

export type SentMessage = {
  id: string;
  title: string;
  body: string;
  remind_every_hours: number | null;
  created_at: string;
  sender: string;
  recipients: { user_id: string; name: string; read_at: string | null; times_sent: number }[];
};
type Person = { id: string; name: string; role: AppRole };
type AudienceType = "everyone" | "levels" | "projects" | "people";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));
const ROLES: AppRole[] = ["technician", "manager", "basic", "admin"];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium", on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}
    >
      {on && <Check className="size-4" aria-hidden />}
      {children}
    </button>
  );
}

export function MessagesView({ people, projects, sent }: { people: Person[]; projects: { id: string; name: string }[]; sent: SentMessage[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AudienceType>("levels");
  const [roles, setRoles] = useState<AppRole[]>(["technician"]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [remind, setRemind] = useState<"" | "1" | "2" | "4" | "8">("2");
  const [busy, setBusy] = useState(false);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const count =
    type === "everyone" ? people.length : type === "levels" ? people.filter((p) => roles.includes(p.role)).length : type === "people" ? userIds.length : null;
  const shownPeople = useMemo(() => {
    const w = q.trim().toLowerCase();
    return w ? people.filter((p) => p.name.toLowerCase().includes(w)) : people;
  }, [people, q]);

  const audience =
    type === "everyone" ? { type } : type === "levels" ? { type, roles } : type === "projects" ? { type, projectIds } : { type, userIds };
  const ready = title.trim() && body.trim() && (type === "everyone" || (type === "levels" ? roles.length : type === "projects" ? projectIds.length : userIds.length));

  return (
    <div className="grid gap-6">
      {dialog}
      <Card>
        <CardContent className="grid gap-4 p-5">
          <label className="grid gap-1 text-sm font-medium">
            Title
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Site closed tomorrow" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Message
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={5} placeholder="Write exactly what people need to know or do." />
          </label>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Send to</legend>
            <NativeSelect value={type} onChange={(e) => setType(e.target.value as AudienceType)} aria-label="Send to">
              <option value="levels">By level (e.g. technicians)</option>
              <option value="projects">By project</option>
              <option value="people">Chosen people</option>
              <option value="everyone">Everyone ({people.length})</option>
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
                <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border p-1">
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
              </div>
            )}
          </fieldset>

          <label className="grid gap-1 text-sm font-medium">
            If not read, send again
            <NativeSelect value={remind} onChange={(e) => setRemind(e.target.value as typeof remind)}>
              <option value="1">Every hour</option>
              <option value="2">Every 2 hours</option>
              <option value="4">Every 4 hours</option>
              <option value="8">Every 8 hours</option>
              <option value="">Don&apos;t send again</option>
            </NativeSelect>
            <span className="text-xs font-normal text-muted-foreground">Between 7am and 7pm, for up to 3 days, until they tap &ldquo;I&apos;ve read this&rdquo;.</span>
          </label>

          <Button
            size="lg"
            disabled={busy || !ready}
            onClick={async () => {
              const who = count === null ? "everyone on the chosen projects" : `${count} ${count === 1 ? "person" : "people"}`;
              if (!(await confirm(`Send this important message to ${who}?`, { body: "They get a phone notification and must confirm they've read it when they open the app.", confirmLabel: "Send" }))) return;
              setBusy(true);
              const res = await sendAnnouncement({ title, body, audience, remindEveryHours: remind ? (Number(remind) as 1 | 2 | 4 | 8) : null });
              setBusy(false);
              if (!res.ok) return void toast.error(res.error);
              toast.success(`Sent to ${res.sentTo} ${res.sentTo === 1 ? "person" : "people"}`);
              setTitle("");
              setBody("");
              router.refresh();
            }}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send important message
          </Button>
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-labelledby="sent-heading">
        <h2 id="sent-heading" className="text-lg font-semibold">
          Sent messages
        </h2>
        {sent.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Nothing sent yet.</p>}
        {sent.map((m) => (
          <SentCard
            key={m.id}
            m={m}
            onDelete={async () => {
              if (!(await confirm("Delete this message?", { body: "People who haven't read it won't see it any more, and reminders stop.", confirmLabel: "Delete" }))) return;
              const res = await deleteAnnouncement(m.id);
              if (!res.ok) return void toast.error(res.error ?? "Couldn't delete");
              toast.success("Message deleted");
              router.refresh();
            }}
          />
        ))}
      </section>
    </div>
  );
}

function SentCard({ m, onDelete }: { m: SentMessage; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const read = m.recipients.filter((r) => r.read_at).length;
  const all = m.recipients.length;
  const done = read === all;
  return (
    <Card>
      <CardContent className="grid gap-3 p-4">
        <div className="flex items-start gap-3">
          <Megaphone className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="break-words font-semibold">{m.title}</p>
            <p className="text-xs text-muted-foreground">
              {when(m.created_at)} · by {m.sender}
              {m.remind_every_hours ? ` · resent every ${m.remind_every_hours} h until read` : ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label={`Delete “${m.title}”`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{m.body}</p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full", done ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${all ? (read / all) * 100 : 0}%` }} />
          </div>
          <span className={cn("shrink-0 text-sm font-semibold", done ? "text-emerald-700 dark:text-emerald-400" : "text-foreground")}>
            {read} of {all} read
          </span>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-11 items-center gap-1 text-sm font-medium text-primary">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden /> {open ? "Hide" : "Show"} who has read it
        </button>
        {open && (
          <ul className="divide-y rounded-xl border">
            {m.recipients.map((r) => (
              <li key={r.user_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.read_at ? (
                  <span className="flex shrink-0 items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <Check className="size-4" aria-hidden /> Read {when(r.read_at)}
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 font-medium text-destructive">
                    <Clock className="size-4" aria-hidden /> Not yet{r.times_sent > 1 ? ` · sent ${r.times_sent}×` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
