"use client";

import { ArrowLeft, FileText, Hand, Loader2, Lock, Mail, MessageSquareReply, Paperclip, Pencil, Phone, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  addTicketMessage,
  createTicketFileUpload,
  deleteTicket,
  deleteTicketFile,
  deleteTicketMessage,
  registerTicketFile,
  updateTicket,
} from "@/app/(app)/aftersales/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_PRIORITIES, TICKET_PRIORITY, TICKET_STATUS, TICKET_STATUSES, ticketRef } from "@/lib/aftersales";
import { uploadWithProgress } from "@/lib/offline/upload";
import { cn } from "@/lib/utils";
import type { AsLookups, TicketDetail, TicketMessage } from "@/types/aftersales";
import type { TicketPatch } from "@/lib/validation/aftersales";
import type { TicketStatus } from "@/types/database";
import { CustomerPicker } from "./customer-picker";
import { PriorityPill, StatusPill, WarrantyBadge } from "./pills";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));
const size = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Photos are made smaller (still readable) so they upload quickly; other files go as they are. */
async function prepare(file: File): Promise<{ blob: Blob; name: string; type: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif" || file.type === "image/gif") {
    return { blob: file, name: file.name, type: file.type || "application/octet-stream" };
  }
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const small = await imageCompression(file, { maxWidthOrHeight: 2200, initialQuality: 0.85, maxSizeMB: 1.8, useWebWorker: true, fileType: "image/jpeg" });
    return { blob: small, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg" };
  } catch {
    return { blob: file, name: file.name, type: file.type };
  }
}

async function uploadTicketFile(ticketId: string, file: File, messageId: string | null): Promise<boolean> {
  const { blob, name, type } = await prepare(file);
  const meta = { ticket_id: ticketId, id: crypto.randomUUID(), message_id: messageId, file_name: name.slice(0, 200) || "file", mime_type: type, size: blob.size };
  const start = await createTicketFileUpload(meta);
  if (!start.ok) return void toast.error(start.error), false;
  try {
    await uploadWithProgress(start.data!.signedUrl, blob, () => {}, type);
  } catch {
    toast.error(`“${name}” didn't finish uploading — check your signal and try again.`);
    return false;
  }
  const saved = await registerTicketFile(meta);
  if (!saved.ok) return void toast.error(saved.error), false;
  return true;
}

type Mode = "reply" | "note" | "customer";
const MODES: { value: Mode; label: string; icon: typeof Send; hint: string }[] = [
  { value: "reply", label: "Reply to customer", icon: MessageSquareReply, hint: "Saved on the ticket. Emailing replies from support@ starts once Gmail is connected — until then, send it from Gmail too." },
  { value: "note", label: "Internal note", icon: Lock, hint: "Only people with Aftersales see notes — never the customer." },
  { value: "customer", label: "Customer said…", icon: Phone, hint: "Write down what the customer told you, e.g. on the phone or on site." },
];

function Message({ m, canDelete, onDelete }: { m: TicketMessage; canDelete: boolean; onDelete: () => void }) {
  if (m.kind === "event") {
    return (
      <li className="flex justify-center px-2">
        <span className="text-center text-xs text-muted-foreground">
          {m.body} · {m.author ?? "System"} · {when(m.created_at)}
        </span>
      </li>
    );
  }
  const style =
    m.kind === "customer"
      ? { box: "bg-muted/60 border", who: m.from_name || m.from_email || "Customer", tag: m.from_email && m.from_name ? m.from_email : m.author && !m.from_email ? `written down by ${m.author}` : null }
      : m.kind === "reply"
        ? { box: "bg-primary/10 border border-primary/30 md:ml-10", who: m.author ?? "Orion", tag: m.email_status === "sent" ? "Emailed" : m.email_status === "failed" ? "Email failed" : "Not emailed" }
        : { box: "bg-amber-500/10 border border-amber-500/40 md:ml-10", who: m.author ?? "Someone", tag: "Internal note" };
  return (
    <li className={cn("grid gap-1 rounded-xl p-3", style.box)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {m.kind === "customer" ? <Mail className="size-3.5 text-muted-foreground" aria-hidden /> : m.kind === "note" ? <Lock className="size-3.5 text-amber-700 dark:text-amber-400" aria-hidden /> : <MessageSquareReply className="size-3.5 text-primary" aria-hidden />}
        <span className="font-semibold">{style.who}</span>
        {style.tag && <span className="text-muted-foreground">· {style.tag}</span>}
        <span className="ml-auto text-muted-foreground">{when(m.created_at)}</span>
        {canDelete && (
          <button type="button" onClick={onDelete} aria-label="Delete this message" className="-my-2 -mr-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
    </li>
  );
}

export function TicketView({ ticket, lookups, meId, isManager, today }: { ticket: TicketDetail; lookups: AsLookups; meId: string; isManager: boolean; today: string }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [saving, setSaving] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("reply");
  const [body, setBody] = useState("");
  const [fromName, setFromName] = useState("");
  const [thenStatus, setThenStatus] = useState<"" | TicketStatus>("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [editSubject, setEditSubject] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  const customer = lookups.customers.find((c) => c.id === ticket.customer_id) ?? null;
  const contacts = customer ? lookups.contacts.filter((c) => c.customer_id === customer.id) : [];
  const sites = customer ? lookups.sites.filter((s) => s.customer_id === customer.id) : [];
  const site = lookups.sites.find((s) => s.id === ticket.site_id) ?? null;
  const contact = lookups.contacts.find((c) => c.id === ticket.contact_id) ?? null;

  async function save(field: string, patch: TicketPatch, ok?: string) {
    setSaving(field);
    const res = await updateTicket(ticket.id, patch);
    setSaving(null);
    if (!res.ok) return void toast.error(res.error);
    if (ok) toast.success(ok);
    router.refresh();
  }

  async function send() {
    setSending(true);
    const res = await addTicketMessage({ ticket_id: ticket.id, kind: mode, body, from_name: fromName, status: thenStatus || undefined });
    if (!res.ok) {
      setSending(false);
      return void toast.error(res.error);
    }
    let allFiles = true;
    for (const f of files) allFiles = (await uploadTicketFile(ticket.id, f, res.data!.id)) && allFiles;
    setSending(false);
    setBody("");
    setFromName("");
    setThenStatus("");
    setFiles([]);
    toast.success(mode === "note" ? "Note added" : mode === "reply" ? "Reply saved" : "Saved");
    if (!allFiles) toast.error("Some files didn't upload — add them again.");
    router.refresh();
  }

  const conversation = ticket.messages;
  const fieldLabel = "grid min-w-0 gap-1 text-xs font-medium text-muted-foreground";

  return (
    <div className="grid gap-4">
      {dialog}
      <Link href="/aftersales" className="inline-flex h-11 items-center gap-1 justify-self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Tickets
      </Link>

      <header className="grid gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
          {ticketRef(ticket.number)}
          {ticket.source === "email" && (
            <span className="inline-flex items-center gap-1 font-normal">
              <Mail className="size-4" aria-hidden /> from an email
            </span>
          )}
          <span className="font-normal">· opened {when(ticket.created_at)}{ticket.creator ? ` by ${ticket.creator}` : ""}</span>
        </p>
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 break-words text-2xl font-bold tracking-tight">{ticket.subject}</h1>
          <Button variant="ghost" size="icon" aria-label="Change the subject" onClick={() => setEditSubject(true)}>
            <Pencil aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={ticket.status} />
          <PriorityPill priority={ticket.priority} />
          {site && <WarrantyBadge end={site.warranty_end} today={today} />}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Details */}
        <Card className="lg:order-2">
          <CardContent className="grid gap-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className={fieldLabel}>
                Status
                <NativeSelect value={ticket.status} disabled={saving === "status"} onChange={(e) => save("status", { status: e.target.value as TicketStatus })}>
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TICKET_STATUS[s].label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className={fieldLabel}>
                Priority
                <NativeSelect value={ticket.priority} disabled={saving === "priority"} onChange={(e) => save("priority", { priority: e.target.value as TicketDetail["priority"] })}>
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {TICKET_PRIORITY[p].label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>
            <div className={fieldLabel}>
              <span>Assigned to</span>
              <div className="flex min-w-0 gap-2">
                <NativeSelect className="min-w-0 flex-1" value={ticket.assigned_to ?? ""} disabled={saving === "assigned"} onChange={(e) => save("assigned", { assigned_to: e.target.value || null })}>
                  <option value="">Not assigned</option>
                  {lookups.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
                {ticket.assigned_to !== meId && lookups.people.some((p) => p.id === meId) && (
                  <Button variant="outline" disabled={!!saving} onClick={() => save("assigned", { assigned_to: meId }, "It's yours")}>
                    <Hand aria-hidden /> Take it
                  </Button>
                )}
              </div>
            </div>
            <label className={fieldLabel}>
              Category
              <NativeSelect value={ticket.category_id ?? ""} disabled={saving === "category"} onChange={(e) => save("category", { category_id: e.target.value || null })}>
                <option value="">—</option>
                {lookups.categories
                  .filter((c) => c.active || c.id === ticket.category_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </NativeSelect>
            </label>
            <div className={fieldLabel}>
              <span>Customer</span>
              <CustomerPicker
                customers={lookups.customers}
                contacts={lookups.contacts}
                value={customer ? { id: customer.id, name: customer.name } : null}
                disabled={saving === "customer"}
                onChange={(c) => {
                  const ss = c ? lookups.sites.filter((s) => s.customer_id === c.id) : [];
                  save("customer", { customer_id: c?.id ?? null, contact_id: c?.contactId ?? null, site_id: ss.length === 1 ? ss[0].id : null });
                }}
              />
              {customer && (
                <Link href={`/aftersales/customers/${customer.id}`} className="justify-self-start text-sm font-medium text-primary hover:underline">
                  Open customer — contacts, sites, other tickets
                </Link>
              )}
            </div>
            {customer && (
              <div className="grid grid-cols-2 gap-3">
                <label className={fieldLabel}>
                  Contact
                  <NativeSelect value={ticket.contact_id ?? ""} disabled={saving === "contact"} onChange={(e) => save("contact", { contact_id: e.target.value || null })}>
                    <option value="">—</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.email || c.phone}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className={fieldLabel}>
                  Site
                  <NativeSelect value={ticket.site_id ?? ""} disabled={saving === "site"} onChange={(e) => save("site", { site_id: e.target.value || null })}>
                    <option value="">{sites.length ? "—" : "No sites yet"}</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              </div>
            )}
            {contact && (contact.email || contact.phone) && (
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {contact.email && (
                  <a href={`mailto:${contact.email}?subject=${encodeURIComponent(`[${ticketRef(ticket.number)}] ${ticket.subject}`)}`} className="inline-flex min-h-9 items-center gap-1 text-primary hover:underline">
                    <Mail className="size-4" aria-hidden /> {contact.email}
                  </a>
                )}
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="inline-flex min-h-9 items-center gap-1 text-primary hover:underline">
                    <Phone className="size-4" aria-hidden /> {contact.phone}
                  </a>
                )}
              </p>
            )}
            {site?.address && <p className="text-sm text-muted-foreground">{site.address}</p>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-3 text-xs">
              <dt className="text-muted-foreground">First reply</dt>
              <dd>{ticket.first_response_at ? when(ticket.first_response_at) : "Not yet"}</dd>
              <dt className="text-muted-foreground">Customer last wrote</dt>
              <dd>{ticket.last_customer_at ? when(ticket.last_customer_at) : "—"}</dd>
              {ticket.resolved_at && (
                <>
                  <dt className="text-muted-foreground">Resolved</dt>
                  <dd>{when(ticket.resolved_at)}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Conversation */}
        <div className="grid gap-4 lg:order-1">
          <ol className="grid gap-3" aria-label="Conversation">
            {conversation.map((m) => (
              <Message
                key={m.id}
                m={m}
                canDelete={isManager && m.kind !== "event"}
                onDelete={async () => {
                  if (!(await confirm("Delete this message?", { body: "It's removed from the ticket for good." }))) return;
                  const res = await deleteTicketMessage(m.id);
                  if (!res.ok) return void toast.error(res.error);
                  router.refresh();
                }}
              />
            ))}
          </ol>

          {ticket.files.length > 0 && (
            <section className="grid gap-2 rounded-xl border p-3" aria-label="Files">
              <h2 className="text-sm font-semibold">Files ({ticket.files.length})</h2>
              <ul className="grid gap-1">
                {ticket.files.map((f) => (
                  <li key={f.id} className="flex min-w-0 items-center gap-2">
                    <a href={`/api/aftersales-files/${f.id}`} target="_blank" rel="noopener" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 hover:bg-accent">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{f.file_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {size(f.size_bytes)} · {f.uploader ?? ""}
                      </span>
                    </a>
                    {(isManager || f.uploaded_by === meId) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${f.file_name}`}
                        onClick={async () => {
                          if (!(await confirm(`Remove “${f.file_name}”?`))) return;
                          const res = await deleteTicketFile(f.id);
                          if (!res.ok) return void toast.error(res.error);
                          router.refresh();
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Write */}
          <Card>
            <CardContent className="grid gap-3 p-4">
              <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="What are you writing?">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="tab"
                    aria-selected={mode === m.value}
                    onClick={() => setMode(m.value)}
                    className={cn(
                      "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
                      mode === m.value ? (m.value === "note" ? "border-amber-500 bg-amber-500/15" : "border-primary bg-primary text-primary-foreground") : "bg-card hover:bg-accent",
                    )}
                  >
                    <m.icon className="size-4" aria-hidden /> {m.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{MODES.find((m) => m.value === mode)!.hint}</p>
              {mode === "customer" && (
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={160} placeholder={`Who said it? e.g. ${contact?.name || "Mr Borg"}`} aria-label="Who said it" />
              )}
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={20000}
                aria-label="Message"
                placeholder={mode === "reply" ? "Write your reply to the customer…" : mode === "note" ? "Write a note for the team…" : "What did the customer say?"}
              />
              {files.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="inline-flex h-9 max-w-full items-center gap-1 rounded-full border bg-muted/50 pl-3 text-sm">
                      <span className="truncate">{f.name}</span>
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="flex size-9 items-center justify-center">
                        <X className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={pick}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10));
                    e.target.value = "";
                  }}
                />
                <Button type="button" variant="outline" onClick={() => pick.current?.click()} disabled={sending}>
                  <Paperclip aria-hidden /> Attach
                </Button>
                <NativeSelect className="w-auto min-w-0 flex-1 sm:flex-none" aria-label="Then set the status" value={thenStatus} onChange={(e) => setThenStatus(e.target.value as TicketStatus | "")}>
                  <option value="">Keep status</option>
                  <option value="waiting">Then: Waiting for customer</option>
                  <option value="in_progress">Then: In progress</option>
                  <option value="resolved">Then: Resolved</option>
                </NativeSelect>
                <Button className="ml-auto" onClick={send} disabled={sending || !body.trim()}>
                  {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                  {mode === "note" ? "Add note" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {isManager && (
            <Button
              variant="ghost"
              className="justify-self-start text-destructive"
              onClick={async () => {
                if (
                  !(await confirm(`Delete ${ticketRef(ticket.number)}?`, {
                    body: "The ticket, its conversation and its files are deleted for good. To keep it, set it to Closed instead.",
                    typeToConfirm: ticketRef(ticket.number),
                  }))
                )
                  return;
                const res = await deleteTicket(ticket.id);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Ticket deleted");
                router.push("/aftersales");
              }}
            >
              <Trash2 aria-hidden /> Delete ticket
            </Button>
          )}
        </div>
      </div>

      {editSubject && <SubjectDialog subject={ticket.subject} onClose={() => setEditSubject(false)} onSave={(s) => save("subject", { subject: s }, "Saved")} />}
    </div>
  );
}

function SubjectDialog({ subject, onClose, onSave }: { subject: string; onClose: () => void; onSave: (s: string) => Promise<void> }) {
  const [value, setValue] = useState(subject);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title="Subject">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await onSave(value);
            setBusy(false);
            onClose();
          }}
        >
          <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={300} required aria-label="Subject" autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
