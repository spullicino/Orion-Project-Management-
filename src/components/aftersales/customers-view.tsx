"use client";

import { ArrowLeft, Building2, Loader2, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteContact, deleteCustomer, deleteSite, saveContact, saveCustomer, saveSite } from "@/app/(app)/aftersales/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate } from "@/lib/utils";
import type { AsContact, AsCustomer, AsLookups, AsSite, TicketRow } from "@/types/aftersales";
import { NewTicketButton } from "./new-ticket-dialog";
import { WarrantyBadge } from "./pills";
import { TicketList } from "./ticket-list";

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function CustomerDialog({ customer, clients, onClose }: { customer: AsCustomer | null; clients: { id: string; name: string }[]; onClose: (id?: string) => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: customer?.name ?? "",
    kind: customer?.kind ?? ("company" as "company" | "person"),
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
    client_id: customer?.client_id ?? "",
  });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={customer ? "Edit customer" : "New customer"} className="max-w-lg">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await saveCustomer(customer?.id ?? null, { ...f, client_id: f.client_id || null });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success("Saved");
            router.refresh();
            onClose(res.data!.id);
          }}
        >
          <div className="flex gap-2" role="group" aria-label="Type of customer">
            {(["company", "person"] as const).map((k) => (
              <Button key={k} type="button" size="sm" variant={f.kind === k ? "default" : "outline"} onClick={() => setF({ ...f, kind: k })}>
                {k === "company" ? "Company" : "Private person"}
              </Button>
            ))}
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Name
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={160} required />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Phone
              <Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={40} />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Same as client in the app (optional)
              <NativeSelect value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Address
            <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={300} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Notes
            <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} maxLength={4000} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onClose()} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !f.name.trim()}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactDialog({ customerId, contact, onClose }: { customerId: string; contact: AsContact | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: contact?.name ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "" });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={contact ? "Edit contact" : "New contact"} description="Emails from this address will be matched to this customer.">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await saveContact(contact?.id ?? null, { customer_id: customerId, ...f });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success("Saved");
            router.refresh();
            onClose();
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Name
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={160} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Email
            <Input type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={254} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Phone
            <Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={40} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !(f.name.trim() || f.email.trim() || f.phone.trim())}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SiteDialog({ customerId, site, projects, onClose }: { customerId: string; site: AsSite | null; projects: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: site?.name ?? "",
    address: site?.address ?? "",
    handover_date: site?.handover_date ?? "",
    warranty_end: site?.warranty_end ?? "",
    project_id: site?.project_id ?? "",
    notes: site?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={site ? "Edit site" : "New site"} description="A building or installation you look after for this customer." className="max-w-lg">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await saveSite(site?.id ?? null, { customer_id: customerId, ...f, project_id: f.project_id || null });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success("Saved");
            router.refresh();
            onClose();
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Name
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={160} required placeholder="e.g. Solair Apartments – Block B" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Address
            <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={300} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Handed over on
              <Input type="date" value={f.handover_date} onChange={(e) => setF({ ...f, handover_date: e.target.value })} />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Warranty ends
              <Input type="date" value={f.warranty_end} onChange={(e) => setF({ ...f, warranty_end: e.target.value })} />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Project in the app (optional)
            <NativeSelect value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>
              <option value="">— Not in the app —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Notes (systems installed, access, etc.)
            <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} maxLength={4000} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !f.name.trim()}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Customers list
// ---------------------------------------------------------------------------

export function CustomersView({ lookups, clients, openCounts, today }: { lookups: AsLookups; clients: { id: string; name: string }[]; openCounts: Record<string, number>; today: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    if (!w) return lookups.customers;
    const viaContact = new Set(lookups.contacts.filter((c) => c.name.toLowerCase().includes(w) || (c.email ?? "").toLowerCase().includes(w) || (c.phone ?? "").includes(w)).map((c) => c.customer_id));
    const viaSite = new Set(lookups.sites.filter((s) => s.name.toLowerCase().includes(w) || (s.address ?? "").toLowerCase().includes(w)).map((s) => s.customer_id));
    return lookups.customers.filter((c) => c.name.toLowerCase().includes(w) || viaContact.has(c.id) || viaSite.has(c.id));
  }, [q, lookups]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer, contact, email or site" aria-label="Find a customer" className="pl-9" />
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden /> New customer
        </Button>
      </div>
      {shown.length ? (
        <ul className="grid divide-y overflow-hidden rounded-xl border bg-card">
          {shown.map((c) => {
            const sites = lookups.sites.filter((s) => s.customer_id === c.id);
            const contacts = lookups.contacts.filter((k) => k.customer_id === c.id);
            const underWarranty = sites.filter((s) => s.warranty_end && s.warranty_end >= today).length;
            return (
              <li key={c.id}>
                <Link href={`/aftersales/customers/${c.id}`} className="flex min-w-0 items-center gap-3 p-3 hover:bg-accent/50 md:px-4">
                  {c.kind === "company" ? <Building2 className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : <UserRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        `${sites.length} ${sites.length === 1 ? "site" : "sites"}${underWarranty ? ` (${underWarranty} under warranty)` : ""}`,
                        contacts.length ? contacts.map((k) => k.name || k.email).join(", ") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {openCounts[c.id] ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{openCounts[c.id]} open</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{q ? `No customer matches “${q}”.` : "No customers yet. They're added from tickets, or tap New customer."}</p>
      )}
      {adding && (
        <CustomerDialog
          customer={null}
          clients={clients}
          onClose={(id) => {
            setAdding(false);
            if (id) router.push(`/aftersales/customers/${id}`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One customer
// ---------------------------------------------------------------------------

export function CustomerDetail({
  customer,
  lookups,
  tickets,
  clients,
  projects,
  isManager,
  today,
  nowMs,
}: {
  customer: AsCustomer;
  lookups: AsLookups;
  tickets: TicketRow[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  isManager: boolean;
  today: string;
  nowMs: number;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<AsContact | null | "new">(null);
  const [site, setSite] = useState<AsSite | null | "new">(null);
  const contacts = lookups.contacts.filter((c) => c.customer_id === customer.id);
  const sites = lookups.sites.filter((s) => s.customer_id === customer.id);
  const client = clients.find((c) => c.id === customer.client_id);
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <div className="grid gap-4">
      {dialog}
      <Link href="/aftersales/customers" className="inline-flex h-11 items-center gap-1 justify-self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Customers
      </Link>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{customer.kind === "company" ? "Company" : "Private person"}</p>
          <h1 className="break-words text-2xl font-bold tracking-tight">{customer.name}</h1>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="inline-flex min-h-9 items-center gap-1 text-primary hover:underline">
                <Phone className="size-4" aria-hidden /> {customer.phone}
              </a>
            )}
            {customer.address && (
              <span className="inline-flex min-h-9 items-center gap-1">
                <MapPin className="size-4" aria-hidden /> {customer.address}
              </span>
            )}
            {client && <span className="inline-flex min-h-9 items-center">Client in the app: {client.name}</span>}
          </p>
          {customer.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{customer.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <NewTicketButton lookups={lookups} presetCustomer={{ id: customer.id, name: customer.name }} />
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Edit
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Sites & installations</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setSite("new")}>
              <Plus aria-hidden /> Add site
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {sites.map((s) => (
              <div key={s.id} className="grid gap-1 rounded-xl border p-3">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium">{s.name}</span>
                    {s.address && <span className="block text-sm text-muted-foreground">{s.address}</span>}
                  </span>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => setSite(s)}>
                    <Pencil aria-hidden />
                  </Button>
                  {isManager && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${s.name}`}
                      onClick={async () => {
                        if (!(await confirm(`Delete the site “${s.name}”?`, { body: "Its tickets stay, without a site." }))) return;
                        const res = await deleteSite(s.id);
                        if (!res.ok) return void toast.error(res.error);
                        router.refresh();
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <WarrantyBadge end={s.warranty_end} today={today} />
                  {s.handover_date && <span>Handed over {formatDate(s.handover_date)}</span>}
                  {s.project_id && <span>· Project: {projectName(s.project_id) ?? "in the app"}</span>}
                </div>
                {s.notes && <p className="whitespace-pre-wrap text-sm">{s.notes}</p>}
              </div>
            ))}
            {!sites.length && <p className="text-sm text-muted-foreground">No sites yet. Add the buildings or installations you look after, with their warranty end date.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Contacts</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setContact("new")}>
              <Plus aria-hidden /> Add contact
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-start gap-2 rounded-xl border p-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.name || "—"}</span>
                  {c.email && (
                    <a href={`mailto:${c.email}`} className={cn("flex min-h-9 items-center gap-1 break-all text-sm text-primary hover:underline")}>
                      <Mail className="size-4 shrink-0" aria-hidden /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex min-h-9 items-center gap-1 text-sm text-primary hover:underline">
                      <Phone className="size-4 shrink-0" aria-hidden /> {c.phone}
                    </a>
                  )}
                </span>
                <Button variant="ghost" size="icon" aria-label={`Edit ${c.name || c.email}`} onClick={() => setContact(c)}>
                  <Pencil aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${c.name || c.email}`}
                  onClick={async () => {
                    if (!(await confirm(`Remove ${c.name || c.email}?`, { body: "Their tickets stay with this customer." }))) return;
                    const res = await deleteContact(c.id);
                    if (!res.ok) return void toast.error(res.error);
                    router.refresh();
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            {!contacts.length && <p className="text-sm text-muted-foreground">No contacts yet. Add the people who email you, so their emails find this customer.</p>}
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-2">
        <h2 className="text-base font-semibold">Tickets ({tickets.length})</h2>
        <TicketList tickets={tickets} empty="No tickets for this customer yet." nowMs={nowMs} />
      </section>

      {isManager && (
        <Button
          variant="ghost"
          className="justify-self-start text-destructive"
          onClick={async () => {
            if (!(await confirm(`Delete ${customer.name}?`, { body: "Their contacts and sites are deleted. Their tickets stay, without a customer.", typeToConfirm: customer.name }))) return;
            const res = await deleteCustomer(customer.id);
            if (!res.ok) return void toast.error(res.error);
            toast.success("Customer deleted");
            router.push("/aftersales/customers");
          }}
        >
          <Trash2 aria-hidden /> Delete customer
        </Button>
      )}

      {editing && <CustomerDialog customer={customer} clients={clients} onClose={() => setEditing(false)} />}
      {contact && <ContactDialog customerId={customer.id} contact={contact === "new" ? null : contact} onClose={() => setContact(null)} />}
      {site && <SiteDialog customerId={customer.id} site={site === "new" ? null : site} projects={projects} onClose={() => setSite(null)} />}
    </div>
  );
}
