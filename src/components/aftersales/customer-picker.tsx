"use client";

import { Building2, Check, Loader2, Plus, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { quickAddCustomer } from "@/app/(app)/aftersales/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AsContact, AsCustomer } from "@/types/aftersales";

export type PickedCustomer = { id: string; name: string; contactId: string | null };

/** Choose a customer (search by name, contact name or email), or add a new one with their first contact. */
export function CustomerPicker({
  customers,
  contacts,
  value,
  onChange,
  disabled,
}: {
  customers: AsCustomer[];
  contacts: AsContact[];
  value: { id: string; name: string } | null;
  onChange: (c: PickedCustomer | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "company" as "company" | "person", contactName: "", email: "", phone: "" });

  const matches = useMemo(() => {
    const w = q.trim().toLowerCase();
    if (!w) return customers.slice(0, 50);
    const viaContact = new Set(contacts.filter((c) => c.name.toLowerCase().includes(w) || (c.email ?? "").toLowerCase().includes(w) || (c.phone ?? "").includes(w)).map((c) => c.customer_id));
    return customers.filter((c) => c.name.toLowerCase().includes(w) || viaContact.has(c.id)).slice(0, 50);
  }, [q, customers, contacts]);

  const close = () => {
    setOpen(false);
    setAdding(false);
    setQ("");
  };

  return (
    <>
      <div className="flex min-w-0 gap-2">
        <Button type="button" variant="outline" className="min-w-0 flex-1 justify-start" onClick={() => setOpen(true)} disabled={disabled}>
          <Building2 aria-hidden />
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value?.name ?? "Choose or add a customer"}</span>
        </Button>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)} disabled={disabled}>
            Clear
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={(o) => !o && !busy && close()}>
        <DialogContent title={adding ? "New customer" : "Choose a customer"} className="max-w-lg">
          {!adding ? (
            <div className="grid gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, contact, email or phone" aria-label="Find a customer" className="pl-9" />
              </div>
              <ul className="grid max-h-80 gap-1 overflow-y-auto rounded-xl border p-1">
                {matches.map((c) => {
                  const cs = contacts.filter((k) => k.customer_id === c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                        onClick={() => {
                          onChange({ id: c.id, name: c.name, contactId: cs.length === 1 ? cs[0].id : null });
                          close();
                        }}
                      >
                        {c.kind === "company" ? <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          {cs.length > 0 && <span className="block truncate text-xs text-muted-foreground">{cs.map((k) => k.name || k.email).join(", ")}</span>}
                        </span>
                        {value?.id === c.id && <Check className="size-4 text-primary" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
                {!matches.length && <li className="p-3 text-sm text-muted-foreground">No customer matches “{q}”.</li>}
              </ul>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForm((f) => ({ ...f, name: q.includes("@") ? "" : q, email: q.includes("@") ? q.trim() : "" }));
                  setAdding(true);
                }}
              >
                <Plus aria-hidden /> New customer
              </Button>
            </div>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const res = await quickAddCustomer({
                  customer: { name: form.name, kind: form.kind },
                  contact: { name: form.kind === "person" && !form.contactName ? form.name : form.contactName, email: form.email, phone: form.phone },
                });
                setBusy(false);
                if (!res.ok) return void toast.error(res.error);
                onChange({ id: res.data!.customerId, name: form.name.trim(), contactId: res.data!.contactId });
                toast.success("Customer added");
                close();
              }}
            >
              <div className="flex gap-2" role="group" aria-label="Type of customer">
                {(["company", "person"] as const).map((k) => (
                  <Button key={k} type="button" size="sm" variant={form.kind === k ? "default" : "outline"} onClick={() => setForm({ ...form, kind: k })}>
                    {k === "company" ? "Company" : "Private person"}
                  </Button>
                ))}
              </div>
              <label className="grid gap-1 text-sm font-medium">
                {form.kind === "company" ? "Company name" : "Name"}
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={160} required />
              </label>
              {form.kind === "company" && (
                <label className="grid gap-1 text-sm font-medium">
                  Contact person (optional)
                  <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} maxLength={160} />
                </label>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-sm font-medium">
                  Email (optional)
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={254} inputMode="email" />
                </label>
                <label className="grid min-w-0 gap-1 text-sm font-medium">
                  Phone (optional)
                  <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Emails from this address will go to this customer automatically (once Gmail is connected).</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAdding(false)} disabled={busy}>
                  Back
                </Button>
                <Button type="submit" disabled={busy || !form.name.trim()}>
                  {busy && <Loader2 className="animate-spin" aria-hidden />} Add customer
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
