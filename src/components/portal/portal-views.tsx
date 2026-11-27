"use client";

import { ArrowLeft, ChevronRight, FileText, Loader2, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { portalOpenTicket, portalReply } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PORTAL_STATUS } from "@/lib/portal-labels";
import { cn } from "@/lib/utils";
import type { PortalMe, PortalTicket, PortalTicketRow } from "@/lib/portal";
import type { TicketStatus } from "@/types/database";
import { AttachFiles } from "./attach";
import { uploadPortalFiles } from "./portal-files";

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));
const size = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function PortalStatus({ status }: { status: TicketStatus }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-semibold", PORTAL_STATUS[status].tone)}>{PORTAL_STATUS[status].label}</span>;
}

export function PortalHome({ me, tickets }: { me: PortalMe; tickets: PortalTicketRow[] }) {
  const open = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed");
  const done = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
  const list = (rows: PortalTicketRow[]) => (
    <ul className="grid divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((t) => (
        <li key={t.number}>
          <Link href={`/portal/tickets/${t.number}`} className="flex min-w-0 items-center gap-3 p-3 hover:bg-accent/50">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-muted-foreground">
                {t.ref}
                {t.site && ` · ${t.site}`}
                {me.shared && t.contact && ` · ${t.contact}`}
              </span>
              <span className="block break-words font-medium">{t.subject}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <PortalStatus status={t.status} /> Updated {when(t.updated_at)}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hello{me.name ? ` ${me.name.split(" ")[0]}` : ""}</h1>
          <p className="text-sm text-muted-foreground">
            {me.customer} · {me.shared ? "all your company's requests" : "your requests"} with Orion Group
          </p>
        </div>
        <Button asChild>
          <Link href="/portal/new">
            <Plus aria-hidden /> New request
          </Link>
        </Button>
      </div>
      <section className="grid gap-2">
        <h2 className="text-base font-semibold">Open ({open.length})</h2>
        {open.length ? list(open) : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Nothing open right now.</p>}
      </section>
      {done.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-base font-semibold">Resolved & closed</h2>
          {list(done)}
        </section>
      )}
    </div>
  );
}

export function PortalTicketView({ t }: { t: PortalTicket }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4">
      <Link href="/portal" className="inline-flex h-11 items-center gap-1 justify-self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> My requests
      </Link>
      <header className="grid gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          {t.ref} · opened {when(t.created_at)}
        </p>
        <h1 className="break-words text-2xl font-bold tracking-tight">{t.subject}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <PortalStatus status={t.status} />
          {t.site && <span>{t.site}</span>}
          {t.category && <span>· {t.category}</span>}
          {t.handled_by && <span>· Handled by {t.handled_by}</span>}
        </div>
        {t.status === "waiting" && <p className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-sm">We&apos;re waiting for your answer — please reply below.</p>}
      </header>

      <ol className="grid gap-3" aria-label="Conversation">
        {t.messages.map((m) => (
          <li key={m.id} className={cn("grid gap-1 rounded-xl border p-3", m.mine ? "bg-muted/60" : "border-primary/30 bg-primary/10 md:ml-10")}>
            <div className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="font-semibold">{m.who}</span>
              <span className="ml-auto text-muted-foreground">{when(m.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
          </li>
        ))}
      </ol>

      {t.files.length > 0 && (
        <section className="grid gap-1 rounded-xl border p-3" aria-label="Files">
          <h2 className="text-sm font-semibold">Photos & files</h2>
          {t.files.map((f) => (
            <a key={f.id} href={`/portal/files/${f.id}`} target="_blank" rel="noopener" className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1 hover:bg-accent">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{f.file_name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{size(f.size_bytes)}</span>
            </a>
          ))}
        </section>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4">
          <label className="grid gap-1 text-sm font-medium">
            {t.status === "resolved" || t.status === "closed" ? "Still a problem? Write to us and we'll look again" : "Write to us"}
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={20000} placeholder="Your message…" />
          </label>
          <AttachFiles files={files} onChange={setFiles} disabled={busy} />
          <Button
            className="justify-self-end"
            disabled={busy || !body.trim()}
            onClick={async () => {
              setBusy(true);
              const res = await portalReply(t.number, body);
              if (!res.ok) {
                setBusy(false);
                return void toast.error(res.error);
              }
              const ok = files.length ? await uploadPortalFiles(t.number, res.data!.id, files) : true;
              setBusy(false);
              setBody("");
              setFiles([]);
              toast.success(ok ? "Sent — thank you" : "Sent, but some files didn't upload");
              router.refresh();
            }}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function PortalNewRequest({ me }: { me: PortalMe }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [site, setSite] = useState(me.sites.length === 1 ? me.sites[0].id : "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4">
      <Link href="/portal" className="inline-flex h-11 items-center gap-1 justify-self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> My requests
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">New request</h1>
      <Card>
        <CardContent className="p-4">
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const res = await portalOpenTicket({ subject, body, siteId: site || null });
              if (!res.ok) {
                setBusy(false);
                return void toast.error(res.error);
              }
              if (files.length) await uploadPortalFiles(res.data!.number, null, files);
              toast.success("Thank you — we've received your request");
              router.push(`/portal/tickets/${res.data!.number}`);
            }}
          >
            <label className="grid gap-1 text-sm font-medium">
              What&apos;s the problem? (short)
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} required placeholder="e.g. Fire alarm panel beeping" />
            </label>
            {me.sites.length > 0 && (
              <label className="grid gap-1 text-sm font-medium">
                Where?
                <NativeSelect value={site} onChange={(e) => setSite(e.target.value)}>
                  <option value="">—</option>
                  {me.sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
            <label className="grid gap-1 text-sm font-medium">
              Tell us more
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={20000} required placeholder="What happens, since when, where exactly, and when we can come." />
            </label>
            <AttachFiles files={files} onChange={setFiles} disabled={busy} />
            <Button type="submit" className="justify-self-end" disabled={busy || !subject.trim() || !body.trim()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send request
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
