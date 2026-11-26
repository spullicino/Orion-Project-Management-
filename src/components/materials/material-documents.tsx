"use client";

import { Camera, CheckCheck, Download, FileText, Loader2, PackageCheck, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { createMaterialDocumentUpload, deleteMaterialDocument, receiveMaterialRequest, registerMaterialDocument } from "@/app/(app)/materials/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { uploadWithProgress } from "@/lib/offline/upload";
import { DOCUMENT_KINDS, type MaterialDocument, type MaterialDocumentKind, type MaterialRequestDetail } from "@/types/materials";

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));
const kindLabel = (k: MaterialDocumentKind) => DOCUMENT_KINDS.find((x) => x.value === k)?.label ?? "Document";

/** Photos are made smaller (still readable) so they upload quickly on site; PDFs go as they are. */
async function prepare(file: File): Promise<{ blob: Blob; name: string; type: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") return { blob: file, name: file.name, type: file.type || "application/pdf" };
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const small = await imageCompression(file, { maxWidthOrHeight: 2200, initialQuality: 0.85, maxSizeMB: 1.8, useWebWorker: true, fileType: "image/jpeg" });
    return { blob: small, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg" };
  } catch {
    return { blob: file, name: file.name, type: file.type };
  }
}

/** Upload one delivery note / invoice to a request. */
export async function uploadMaterialDocument(requestId: string, file: File, kind: MaterialDocumentKind, onProgress?: (pct: number) => void): Promise<boolean> {
  const { blob, name, type } = await prepare(file);
  const meta = { request_id: requestId, id: crypto.randomUUID(), file_name: name.slice(0, 200) || "document", mime_type: type, size: blob.size, kind };
  const ticket = await createMaterialDocumentUpload(meta);
  if (!ticket.ok) {
    toast.error(ticket.error);
    return false;
  }
  try {
    await uploadWithProgress(ticket.data!.signedUrl, blob, (n) => onProgress?.(Math.round((n / blob.size) * 100)), type);
  } catch {
    toast.error("The upload didn't finish — check your signal and try again.");
    return false;
  }
  const saved = await registerMaterialDocument(meta);
  if (!saved.ok) {
    toast.error(saved.error);
    return false;
  }
  return true;
}

/** Two buttons: take a photo of the paper, or pick a photo / PDF. */
function FilePickers({ disabled, onFile }: { disabled?: boolean; onFile: (f: File) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onFile(f);
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={take} />
      <input ref={picker} type="file" accept="image/*,application/pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={take} />
      <Button type="button" variant="outline" disabled={disabled} onClick={() => camera.current?.click()}>
        <Camera aria-hidden /> Take photo
      </Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => picker.current?.click()}>
        <Upload aria-hidden /> Choose file
      </Button>
    </div>
  );
}

function AddDocumentDialog({ requestId, onClose, onDone }: { requestId: string; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<MaterialDocumentKind>("delivery_note");
  const [pct, setPct] = useState<number | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && pct === null && onClose()}>
      <DialogContent title="Add a document" description="Take a photo of the delivery note or invoice the supplier gave you, or choose a photo or PDF.">
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            What is it?
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as MaterialDocumentKind)} disabled={pct !== null}>
              {DOCUMENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <FilePickers
            disabled={pct !== null}
            onFile={async (f) => {
              setPct(0);
              const ok = await uploadMaterialDocument(requestId, f, kind, setPct);
              setPct(null);
              if (ok) {
                toast.success(`${kindLabel(kind)} added`);
                onDone();
                onClose();
              }
            }}
          />
          {pct !== null && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Uploading… {pct}%
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Delivery documents" on a request: list, open, download, add, remove. */
export function DocumentsSection({
  requestId,
  documents,
  canAdd,
  canDelete,
  onChanged,
}: {
  requestId: string;
  documents: MaterialDocument[];
  canAdd: boolean;
  canDelete: (d: MaterialDocument) => boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const { confirm, dialog } = useConfirm();
  if (!canAdd && !documents.length) return null;
  return (
    <section>
      {dialog}
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Delivery documents</h3>
        {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Paperclip aria-hidden /> Add
          </Button>
        )}
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No delivery note or invoice yet. When it arrives, tap <strong>Add</strong> and take a photo of it.</p>
      ) : (
        <ul className="grid gap-1.5">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg border px-3 py-1">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <a href={`/api/material-documents/${d.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 py-1.5 text-sm hover:underline">
                <span className="block truncate font-medium text-primary">{kindLabel(d.kind)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {d.uploaded_by_name} · {when(d.created_at)}
                </span>
              </a>
              <Button asChild variant="ghost" size="icon">
                <a href={`/api/material-documents/${d.id}?download=1`} target="_blank" rel="noopener" aria-label={`Download ${d.file_name}`}>
                  <Download />
                </a>
              </Button>
              {canDelete(d) && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${kindLabel(d.kind)}`}
                  onClick={async () => {
                    if (!(await confirm(`Remove this ${kindLabel(d.kind).toLowerCase()}?`, { confirmLabel: "Remove" }))) return;
                    const res = await deleteMaterialDocument(d.id);
                    if (!res.ok) return void toast.error(res.error);
                    toast.success("Removed");
                    onChanged();
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <AddDocumentDialog requestId={requestId} onClose={() => setAdding(false)} onDone={onChanged} />}
    </section>
  );
}

const qty = (n: number) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** On site: confirm what arrived (short items → Partly delivered) and attach the delivery note. */
export function ReceiveDialog({ r, onClose, onDone }: { r: MaterialRequestDetail; onClose: () => void; onDone: () => void }) {
  const [got, setGot] = useState<Record<string, string>>(
    Object.fromEntries(r.items.map((i) => [i.id, String(Number(i.delivered_qty) > 0 ? Number(i.delivered_qty) : Number(i.quantity))])),
  );
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const all = r.items.every((i) => (Number(got[i.id]) || 0) >= Number(i.quantity));
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title="Received on site" description="Check what arrived. Change any item that came short." className="max-w-lg">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy("Saving…");
            const res = await receiveMaterialRequest(r.id, {
              deliveries: r.items.map((i) => ({ item_id: i.id, delivered_qty: Math.max(0, Number(got[i.id]) || 0) })),
              note: note.trim() || undefined,
            });
            if (!res.ok) {
              setBusy(null);
              return void toast.error(res.error);
            }
            if (file) {
              setBusy("Uploading the delivery note…");
              await uploadMaterialDocument(r.id, file, "delivery_note");
            }
            setBusy(null);
            toast.success(res.data?.status === "delivered" ? "Marked delivered — the manager has been told" : "Marked partly delivered — the manager has been told");
            onDone();
            onClose();
          }}
        >
          <ul className="grid gap-2">
            {r.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded-lg border p-2">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium">{i.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Asked for {qty(i.quantity)} {i.unit}
                  </span>
                </span>
                <Input
                  value={got[i.id]}
                  onChange={(e) => setGot((g) => ({ ...g, [i.id]: e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") }))}
                  inputMode="decimal"
                  aria-label={`Quantity of ${i.name} received`}
                  className="w-24 text-right"
                />
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{all ? "Everything has arrived — it will be marked Delivered." : "Some items came short — it will be marked Partly delivered."}</p>
          <label className="grid gap-1 text-sm font-medium">
            Note (optional)
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} placeholder="e.g. 2 sheets damaged, left at the site store" />
          </label>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Delivery note (recommended)</span>
            {file ? (
              <p className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>
                  Change
                </Button>
              </p>
            ) : (
              <FilePickers onFile={setFile} />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {busy && <span className="mr-auto text-sm text-muted-foreground">{busy}</span>}
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => setGot(Object.fromEntries(r.items.map((i) => [i.id, String(Number(i.quantity))])))}>
              <CheckCheck aria-hidden /> All arrived
            </Button>
            <Button type="submit" disabled={!!busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <PackageCheck aria-hidden />} Confirm received
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
