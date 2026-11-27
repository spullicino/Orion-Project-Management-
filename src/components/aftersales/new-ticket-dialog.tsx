"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createTicket } from "@/app/(app)/aftersales/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_PRIORITIES, TICKET_PRIORITY, ticketRef } from "@/lib/aftersales";
import type { AsLookups } from "@/types/aftersales";
import type { TicketPriority } from "@/types/database";
import { CustomerPicker } from "./customer-picker";

/** Staff open a ticket themselves (e.g. after a phone call). Emails to support@ will open them automatically (stage 2). */
export function NewTicketButton({ lookups, presetCustomer }: { lookups: AsLookups; presetCustomer?: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden /> New ticket
      </Button>
      {open && <NewTicketDialog lookups={lookups} presetCustomer={presetCustomer} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewTicketDialog({ lookups, presetCustomer, onClose }: { lookups: AsLookups; presetCustomer?: { id: string; name: string }; onClose: () => void }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(presetCustomer ?? null);
  const [contactId, setContactId] = useState<string>(() => {
    const cs = presetCustomer ? lookups.contacts.filter((c) => c.customer_id === presetCustomer.id) : [];
    return cs.length === 1 ? cs[0].id : "";
  });
  const [siteId, setSiteId] = useState<string>(() => {
    const ss = presetCustomer ? lookups.sites.filter((s) => s.customer_id === presetCustomer.id) : [];
    return ss.length === 1 ? ss[0].id : "";
  });
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [assignee, setAssignee] = useState("");
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);

  const contacts = customer ? lookups.contacts.filter((c) => c.customer_id === customer.id) : [];
  const sites = customer ? lookups.sites.filter((s) => s.customer_id === customer.id) : [];

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title="New ticket" description="For a call or visit. Emails to support@ will open tickets by themselves once Gmail is connected." className="max-w-lg">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await createTicket({
              subject,
              priority,
              category_id: categoryId || null,
              customer_id: customer?.id ?? null,
              contact_id: contactId || null,
              site_id: siteId || null,
              assigned_to: assignee || null,
              report,
            });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success(`Ticket ${ticketRef(res.data!.number)} opened`);
            onClose();
            router.push(`/aftersales/tickets/${res.data!.number}`);
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Subject
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} required placeholder="e.g. Fire alarm panel beeping – Block B" />
          </label>
          <div className="grid gap-1 text-sm font-medium">
            Customer
            <CustomerPicker
              customers={lookups.customers}
              contacts={lookups.contacts}
              value={customer}
              onChange={(c) => {
                setCustomer(c ? { id: c.id, name: c.name } : null);
                setContactId(c?.contactId ?? "");
                const ss = c ? lookups.sites.filter((s) => s.customer_id === c.id) : [];
                setSiteId(ss.length === 1 ? ss[0].id : "");
              }}
            />
          </div>
          {customer && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1 text-sm font-medium">
                Contact
                <NativeSelect value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">—</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email || c.phone}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid min-w-0 gap-1 text-sm font-medium">
                Site
                <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)}>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Category
              <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">—</option>
                {lookups.categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </NativeSelect>
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Priority
              <NativeSelect value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TICKET_PRIORITY[p].label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Assign to
            <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Not yet</option>
              {lookups.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            What did the customer report? (optional)
            <Textarea value={report} onChange={(e) => setReport(e.target.value)} rows={4} maxLength={20000} placeholder="e.g. Panel shows fault on zone 3 since yesterday evening" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !subject.trim()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Open ticket
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
