"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteClient, saveClient } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Client } from "@/types/board";

export function ClientsManager({ clients, canDelete }: { clients: Client[]; canDelete: boolean }) {
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const current = editing && editing !== "new" ? editing : null;

  function submit(form: FormData) {
    start(async () => {
      const res = await saveClient(current?.id ?? null, Object.fromEntries(form));
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Saved");
        setEditing(null);
      }
    });
  }

  return (
    <>
      <Button onClick={() => setEditing("new")} className="mb-4">
        <Plus aria-hidden /> Add client
      </Button>
      <ul className="divide-y rounded-xl border bg-card">
        {clients.map((c) => (
          <li key={c.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="truncate text-sm text-muted-foreground">{[c.contact_name, c.contact_email, c.contact_phone].filter(Boolean).join(" · ") || "No contact details"}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
              <Pencil />
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${c.name}`}
                onClick={async () => {
                  if (!(await confirm(`Delete ${c.name}?`, { body: "Projects for this client are kept but will show no client." }))) return;
                  const res = await deleteClient(c.id);
                  if (res.ok) toast.success(res.message ?? "Deleted");
                  else toast.error(res.error);
                }}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
        {clients.length === 0 && <li className="p-6 text-center text-muted-foreground">No clients yet.</li>}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && (
          <DialogContent title={current ? `Edit ${current.name}` : "New client"}>
            <form action={submit} className="grid gap-4">
              <FormField id="name" label="Name">
                <Input name="name" defaultValue={current?.name} required maxLength={160} />
              </FormField>
              <FormField id="contact_name" label="Contact person (optional)">
                <Input name="contact_name" defaultValue={current?.contact_name ?? ""} maxLength={160} />
              </FormField>
              <FormField id="contact_email" label="Email (optional)">
                <Input name="contact_email" type="email" inputMode="email" defaultValue={current?.contact_email ?? ""} />
              </FormField>
              <FormField id="contact_phone" label="Phone (optional)">
                <Input name="contact_phone" type="tel" inputMode="tel" defaultValue={current?.contact_phone ?? ""} maxLength={40} />
              </FormField>
              <FormField id="notes" label="Notes (optional)">
                <Textarea name="notes" defaultValue={current?.notes ?? ""} maxLength={4000} />
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  Save
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
      {dialog}
    </>
  );
}
