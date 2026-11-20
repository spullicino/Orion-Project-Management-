"use client";

import { Building2, ImageUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteClient, saveClient } from "@/app/(app)/projects/actions";
import { createClientLogoUpload, saveClientLogo } from "@/app/(app)/projects/gantt-actions";
import { createClient } from "@/lib/supabase/client";
import { LOGO_MAX_BYTES } from "@/lib/validation/projects";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Client } from "@/types/board";

function LogoBox({ src, name }: { src?: string | null; name: string }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${name} logo`} className="max-h-full max-w-full object-contain p-1" />
      ) : (
        <Building2 className="size-5 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

function LogoUpload({ client, src }: { client: Client; src?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) return void toast.error("Logos can be up to 2 MB.");
    setBusy(true);
    try {
      const ticket = await createClientLogoUpload(client.id, { contentType: file.type, size: file.size });
      if (!ticket.ok || !ticket.data) throw new Error(ticket.ok ? "Upload failed" : ticket.error);
      const { error } = await createClient().storage.from("branding").uploadToSignedUrl(ticket.data.path, ticket.data.token, file, { contentType: file.type });
      if (error) throw new Error("Upload failed. Please try again.");
      const saved = await saveClientLogo(client.id, ticket.data.path);
      if (!saved.ok) throw new Error(saved.error);
      toast.success("Logo saved");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3">
      <LogoBox src={src} name={client.name} />
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ImageUp aria-hidden />}
          {src ? "Change logo" : "Upload logo"}
        </Button>
        {src && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              const res = await saveClientLogo(client.id, null);
              if (!res.ok) return void toast.error(res.error);
              router.refresh();
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function ClientsManager({ clients, logos, canDelete }: { clients: Client[]; logos: Record<string, string>; canDelete: boolean }) {
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  // Look the client up again so a freshly uploaded logo shows straight away.
  const current = editing && editing !== "new" ? (clients.find((c) => c.id === editing.id) ?? editing) : null;

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
            <LogoBox src={c.logo_path ? logos[c.logo_path] : null} name={c.name} />
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
            {current && <LogoUpload client={current} src={current.logo_path ? logos[current.logo_path] : null} />}
            {!current && <p className="text-sm text-muted-foreground">You can add a logo after saving.</p>}
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
