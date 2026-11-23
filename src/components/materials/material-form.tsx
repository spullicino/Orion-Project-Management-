"use client";

import { Camera, ImagePlus, Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { editMaterialRequest } from "@/app/(app)/materials/actions";
import { useOutbox } from "@/components/diary/outbox-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/board";
import { processPhoto, type ProcessedPhoto } from "@/lib/images/compress";
import { MAX_MATERIAL_PHOTOS } from "@/lib/validation/materials";
import { COMMON_UNITS, type Product } from "@/types/materials";
import { ProductPicker } from "./product-picker";

const PRODUCTS_CACHE = "orion:products";
/** The product list is kept on the phone so the picker works without signal. */
function cachedProducts(): Product[] {
  try {
    return JSON.parse(localStorage.getItem(PRODUCTS_CACHE) ?? "[]") as Product[];
  } catch {
    return [];
  }
}
export function rememberProducts(list: Product[]) {
  try {
    localStorage.setItem(PRODUCTS_CACHE, JSON.stringify(list));
  } catch {
    /* storage full or unavailable */
  }
}

export type MaterialFormItem = { name: string; quantity: string; unit: string; note: string; product_id?: string | null };
export type MaterialFormStart = {
  /** "new" (also used for Reorder), or "edit" an existing request that's still waiting. */
  mode: "new" | "edit";
  requestId?: string;
  copiedFrom?: string | null;
  items?: MaterialFormItem[];
  needed_by?: string | null;
  urgent?: boolean;
  delivery_note?: string | null;
};
type Project = { id: string; name: string };

const blank = (): MaterialFormItem => ({ name: "", quantity: "", unit: "pcs", note: "", product_id: null });

/** New / reorder / edit a material request. New requests go through the phone's outbox (works offline). */
export function MaterialForm({
  open,
  onClose,
  projects,
  projectId: fixedProject,
  start,
  onSaved,
  products: productList,
}: {
  /** The product catalogue (falls back to the copy saved on this phone). */
  products?: Product[];
  open: boolean;
  onClose: () => void;
  /** Projects to choose from (when not opened from inside a project). */
  projects?: Project[];
  projectId?: string;
  start: MaterialFormStart;
  onSaved?: () => void;
}) {
  const { enqueueMaterial } = useOutbox();
  const [catalogue] = useState<Product[]>(() => (productList?.length ? productList : typeof window === "undefined" ? [] : cachedProducts()));
  const [projectId, setProjectId] = useState(fixedProject ?? (projects?.length === 1 ? projects[0].id : ""));
  const [items, setItems] = useState<MaterialFormItem[]>(start.items?.length ? start.items : [blank()]);
  const [neededBy, setNeededBy] = useState(start.needed_by ?? "");
  const [urgent, setUrgent] = useState(start.urgent ?? false);
  const [note, setNote] = useState(start.delivery_note ?? "");
  const [photos, setPhotos] = useState<ProcessedPhoto[]>([]);
  const [processing, setProcessing] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const editing = start.mode === "edit";
  const projectName = projects?.find((p) => p.id === projectId)?.name ?? "";

  const setItem = (i: number, patch: Partial<MaterialFormItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_MATERIAL_PHOTOS - photos.length - processing;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, Math.max(0, room));
    if (files.length > room) toast.warning(`You can add up to ${MAX_MATERIAL_PHOTOS} photos.`);
    setProcessing((n) => n + list.length);
    for (const f of list) {
      try {
        const p = await processPhoto(f);
        setPhotos((ps) => [...ps, p]);
      } catch {
        toast.error(`Couldn't read ${f.name}.`);
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  }

  async function submit() {
    setError(null);
    const filled = items.filter((it) => it.name.trim() || it.quantity.trim());
    if (!fixedProject && !projectId) return setError("Choose the project.");
    if (!filled.length) return setError("Add at least one item.");
    const bad = filled.find((it) => !it.name.trim() || !(Number(it.quantity) > 0));
    if (bad) return setError("Each item needs a name and a quantity more than 0.");
    if (processing) return setError("Please wait — photos are still being prepared.");
    const clean = filled.map((it) => ({ name: it.name.trim(), quantity: Number(it.quantity), unit: it.unit || "pcs", note: it.note.trim() || null, product_id: it.product_id ?? null }));
    setSaving(true);
    try {
      if (editing && start.requestId) {
        const res = await editMaterialRequest(start.requestId, { needed_by: neededBy || null, urgent, delivery_note: note || null, items: clean });
        if (!res.ok) return setError(res.error);
        toast.success("Request updated");
      } else {
        await enqueueMaterial({
          client_ref: crypto.randomUUID(),
          project_id: fixedProject ?? projectId,
          project_name: projectName,
          needed_by: neededBy || null,
          urgent,
          delivery_note: note.trim() || null,
          items: clean,
          copied_from: start.copiedFrom ?? null,
          photos: photos.map((p) => ({ id: p.id, full: p.full, thumb: p.thumb, width: p.width, height: p.height, uploaded: false })),
        });
        photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        toast.success("Request saved — sending now");
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError((e as Error).message || "Couldn't save the request on this phone.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={editing ? "Edit material request" : start.copiedFrom ? "Reorder materials" : "New material request"}
        description={editing ? "You can change it until someone starts handling it." : "Say what you need on site. The project's managers are notified straight away."}
        className="max-w-xl"
      >
        <div className="grid gap-4">
          {!fixedProject && (
            <label className="grid gap-1 text-sm font-medium">
              Project
              <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Choose the project…</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">What do you need?</legend>
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 rounded-xl border p-3">
                <div className="flex gap-2">
                  <ProductPicker
                    products={catalogue}
                    value={it.name}
                    productId={it.product_id ?? null}
                    label={`Item ${i + 1}`}
                    onChange={({ name, product }) => setItem(i, product ? { name, product_id: product.id, unit: product.unit } : { name, product_id: null })}
                  />
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={it.quantity}
                    onChange={(e) => setItem(i, { quantity: e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") })}
                    inputMode="decimal"
                    placeholder="Qty"
                    aria-label={`Quantity for item ${i + 1}`}
                    className="w-24"
                  />
                  <div className="w-32">
                    <NativeSelect value={COMMON_UNITS.includes(it.unit) ? it.unit : "other"} onChange={(e) => setItem(i, { unit: e.target.value === "other" ? "" : e.target.value })} aria-label={`Unit for item ${i + 1}`}>
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                      <option value="other">Other…</option>
                    </NativeSelect>
                  </div>
                  {!COMMON_UNITS.includes(it.unit) && (
                    <Input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} placeholder="Unit" aria-label={`Custom unit for item ${i + 1}`} maxLength={20} className="w-24" />
                  )}
                </div>
                <Input value={it.note} onChange={(e) => setItem(i, { note: e.target.value })} placeholder="Note (optional) — size, colour, brand…" aria-label={`Note for item ${i + 1}`} maxLength={300} />
              </div>
            ))}
            <Button variant="outline" className="justify-self-start" onClick={() => setItems((xs) => [...xs, blank()])} disabled={items.length >= 100}>
              <Plus aria-hidden /> Add another item
            </Button>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Needed by
              <Input type="date" value={neededBy} min={editing ? undefined : todayISO()} onChange={(e) => setNeededBy(e.target.value)} />
            </label>
            <label className="flex items-center gap-3 self-end rounded-lg border px-3 py-2">
              <Switch checked={urgent} onCheckedChange={setUrgent} />
              <span className="text-sm font-medium">Urgent</span>
            </label>
          </div>

          <label className="grid gap-1 text-sm font-medium">
            Delivery notes (optional)
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Deliver to the back gate, call Tina on arrival" maxLength={1000} rows={2} />
          </label>

          {!editing && (
            <div className="grid gap-2">
              <span className="text-sm font-medium">Photos (optional)</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => camera.current?.click()}>
                  <Camera aria-hidden /> Take photo
                </Button>
                <Button variant="outline" onClick={() => gallery.current?.click()}>
                  <ImagePlus aria-hidden /> From gallery
                </Button>
                <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
                <input ref={gallery} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
              </div>
              {(photos.length > 0 || processing > 0) && (
                <ul className="flex flex-wrap gap-2">
                  {photos.map((p) => (
                    <li key={p.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                      <img src={p.previewUrl} alt="" className="size-20 rounded-lg object-cover" />
                      <button type="button" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-foreground text-background" aria-label="Remove photo">
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                  {processing > 0 && (
                    <li className="flex size-20 items-center justify-center rounded-lg bg-muted">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Preparing photo" />
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} {editing ? "Save changes" : "Send request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
