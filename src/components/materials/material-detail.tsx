"use client";

import { Ban, CheckCheck, Copy, FileDown, Loader2, Pencil, Plus, RotateCcw, Send, ShoppingCart, Truck, XCircle, PackageCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { addMaterialComment, loadMaterialRequest, updateMaterialStatus } from "@/app/(app)/materials/actions";
import { saveProduct } from "@/app/(app)/products/actions";
import { Lightbox } from "@/components/diary/lightbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { shortDate, todayISO } from "@/lib/board";
import { chatTime } from "@/lib/chat";
import { buildMaterialPdf } from "@/lib/materials/pdf";
import { cn, formatDate, fullName } from "@/lib/utils";
import { MATERIAL_STATUS, type MaterialRequestDetail, type MaterialStatus } from "@/types/materials";
import { DocumentsSection, ReceiveDialog } from "./material-documents";
import type { MaterialFormStart } from "./material-form";

const qty = (n: number) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 });
const EVENT_LABEL: Record<string, string> = {
  created: "requested it",
  document: "added a document",
  requested: "reopened it",
  ordered: "marked it ordered",
  partly_delivered: "recorded a partial delivery",
  delivered: "marked it delivered",
  rejected: "rejected it",
  cancelled: "cancelled it",
};

export function StatusPill({ status, className }: { status: MaterialStatus; className?: string }) {
  return <span className={cn("inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold", MATERIAL_STATUS[status].tone, className)}>{MATERIAL_STATUS[status].label}</span>;
}

/** The request panel: items, photos, delivery details, manager actions, comments and history. */
export function MaterialDetail({
  requestId,
  onClose,
  me,
  onEdit,
  onReorder,
  onChanged,
  loader = loadMaterialRequest,
}: {
  /** Overridable for the development preview (no database). */
  loader?: typeof loadMaterialRequest;
  requestId: string | null;
  onClose: () => void;
  me: { id: string; canManage: (projectId: string) => boolean; canEdit: (projectId: string) => boolean };
  onEdit: (start: MaterialFormStart, projectId: string) => void;
  onReorder: (start: MaterialFormStart, projectId: string) => void;
  onChanged: () => void;
}) {
  const [r, setR] = useState<MaterialRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<number | null>(null);
  const [dialog, setDialog] = useState<null | "ordered" | "delivery" | "reject">(null);
  const [receiving, setReceiving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    if (!requestId) return;
    const res = await loader(requestId);
    if (!res.ok) return setError(res.error);
    if (!res.data) return setError("This request no longer exists, or you can't see it.");
    setR(res.data);
    setError(null);
  }, [requestId, loader]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset when another request is opened */
    setR(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    void load();
  }, [load]);

  const change = async (input: Record<string, unknown>, done: string) => {
    if (!r) return false;
    setBusy(true);
    const res = await updateMaterialStatus(r.id, input);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(done);
    await load();
    onChanged();
    return true;
  };

  const canManage = r ? me.canManage(r.project_id) : false;
  const canEdit = r ? me.canEdit(r.project_id) : false;
  const mine = r?.requested_by === me.id;
  const open = r ? ["requested", "ordered", "partly_delivered"].includes(r.status) : false;
  const late = r && open && r.needed_by && r.needed_by < todayISO();
  const formItems = r?.items.map((i) => ({ name: i.name, quantity: String(Number(i.quantity)), unit: i.unit, note: i.note ?? "", product_id: i.product_id ?? null })) ?? [];

  return (
    <Sheet open={!!requestId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent title={r ? `Material request #${r.number}` : "Material request"} description="Material request details">
        <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 pb-8 pt-3 md:px-6 md:pt-5">
          {error ? (
            <p className="mt-8 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          ) : !r ? (
            <p className="mt-8 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
            </p>
          ) : (
            <>
              <header className="grid gap-2 pr-12">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-3 rounded-full" style={{ background: r.project.color }} aria-hidden /> {r.project.name}
                </p>
                <h2 className="text-xl font-bold">Material request #{r.number}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={r.status} />
                  {r.urgent && <span className="inline-flex h-7 items-center rounded-full bg-red-600 px-3 text-xs font-semibold text-white">Urgent</span>}
                  {late && <span className="text-sm font-medium text-destructive">Late — needed {shortDate(r.needed_by!)}</span>}
                </div>
                <p className="text-sm text-muted-foreground">
                  Requested by {r.requester ? fullName(r.requester) : "someone"} · {chatTime(r.created_at)}
                </p>
              </header>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border p-3 text-sm">
                <dt className="text-muted-foreground">Needed by</dt>
                <dd>{r.needed_by ? formatDate(r.needed_by) : "Not set"}</dd>
                {r.delivery_note && (
                  <>
                    <dt className="text-muted-foreground">Delivery</dt>
                    <dd className="whitespace-pre-wrap">{r.delivery_note}</dd>
                  </>
                )}
                {r.supplier && (
                  <>
                    <dt className="text-muted-foreground">Supplier</dt>
                    <dd>{r.supplier}</dd>
                  </>
                )}
                {r.po_number && (
                  <>
                    <dt className="text-muted-foreground">PO number</dt>
                    <dd>{r.po_number}</dd>
                  </>
                )}
                {r.expected_date && (
                  <>
                    <dt className="text-muted-foreground">Expected</dt>
                    <dd>{formatDate(r.expected_date)}</dd>
                  </>
                )}
                {r.reject_reason && (
                  <>
                    <dt className="text-muted-foreground">Rejected because</dt>
                    <dd>{r.reject_reason}</dd>
                  </>
                )}
              </dl>

              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Items ({r.items.length})</h3>
                <ul className="divide-y rounded-xl border">
                  {r.items.map((it) => (
                    <li key={it.id} className="flex items-start gap-3 p-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{it.name}</span>
                        {it.note && <span className="block text-sm text-muted-foreground">{it.note}</span>}
                        {it.product_id === null && (
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            Not in the product list
                            {canManage && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9"
                                disabled={busy}
                                onClick={async () => {
                                  setBusy(true);
                                  const res = await saveProduct(null, { name: it.name, unit: it.unit });
                                  setBusy(false);
                                  if (!res.ok) return void toast.error(res.error);
                                  toast.success(`“${it.name}” added to products`);
                                  await load();
                                }}
                              >
                                <Plus aria-hidden /> Add to products
                              </Button>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold tabular-nums">
                          {qty(it.quantity)} {it.unit}
                        </span>
                        {Number(it.delivered_qty) > 0 && (
                          <span className={cn("block text-xs", Number(it.delivered_qty) >= Number(it.quantity) ? "text-success" : "text-amber-700 dark:text-amber-400")}>
                            {qty(it.delivered_qty)} delivered
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {r.photos.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Photos</h3>
                  <ul className="grid grid-cols-4 gap-1.5">
                    {r.photos.map((p, i) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setPhoto(i)} className="block aspect-square w-full overflow-hidden rounded-lg bg-muted" aria-label={`Open photo ${i + 1}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs */}
                          <img src={p.thumb_url ?? p.url ?? ""} alt="" className="size-full object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <DocumentsSection
                requestId={r.id}
                documents={r.documents ?? []}
                canAdd={(canEdit || canManage) && r.documents !== undefined}
                canDelete={(d) => canManage || d.uploaded_by === me.id}
                onChanged={() => {
                  void load();
                  onChanged();
                }}
              />

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {!canManage && canEdit && open && r.status !== "requested" && (
                  <Button onClick={() => setReceiving(true)} disabled={busy}>
                    <PackageCheck aria-hidden /> Received on site
                  </Button>
                )}
                {!canManage && canEdit && r.status === "requested" && (
                  <Button variant="outline" onClick={() => setReceiving(true)} disabled={busy}>
                    <PackageCheck aria-hidden /> Received on site
                  </Button>
                )}
                {canManage && r.status === "requested" && (
                  <Button onClick={() => setDialog("ordered")} disabled={busy}>
                    <ShoppingCart aria-hidden /> Mark ordered
                  </Button>
                )}
                {canManage && open && (
                  <>
                    <Button variant={r.status === "requested" ? "outline" : "default"} onClick={() => setDialog("delivery")} disabled={busy}>
                      <Truck aria-hidden /> Record delivery
                    </Button>
                    {r.status !== "requested" && (
                      <Button variant="outline" onClick={() => setDialog("ordered")} disabled={busy}>
                        <Pencil aria-hidden /> Order details
                      </Button>
                    )}
                    <Button variant="outline" className="text-destructive" onClick={() => setDialog("reject")} disabled={busy}>
                      <XCircle aria-hidden /> Reject
                    </Button>
                  </>
                )}
                {canManage && !open && (
                  <Button variant="outline" onClick={() => void change({ status: "requested" }, "Request reopened")} disabled={busy}>
                    <RotateCcw aria-hidden /> Reopen
                  </Button>
                )}
                {r.status === "requested" && (mine || canManage) && (
                  <Button variant="outline" onClick={() => onEdit({ mode: "edit", requestId: r.id, items: formItems, needed_by: r.needed_by, urgent: r.urgent, delivery_note: r.delivery_note }, r.project_id)}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                )}
                {r.status === "requested" && mine && !canManage && (
                  <Button
                    variant="outline"
                    className="text-destructive"
                    disabled={busy}
                    onClick={async () => {
                      if (await confirm("Cancel this request?", { body: "The request stays in the list as Cancelled.", confirmLabel: "Cancel request", cancelLabel: "Keep it" })) await change({ status: "cancelled" }, "Request cancelled");
                    }}
                  >
                    <Ban aria-hidden /> Cancel request
                  </Button>
                )}
                {canEdit && (
                  <Button variant="outline" onClick={() => onReorder({ mode: "new", copiedFrom: r.id, items: formItems, delivery_note: r.delivery_note }, r.project_id)}>
                    <Copy aria-hidden /> Reorder
                  </Button>
                )}
                <Button variant="outline" onClick={() => void buildMaterialPdf(r).catch(() => toast.error("Couldn't make the PDF."))}>
                  <FileDown aria-hidden /> PDF for supplier
                </Button>
              </div>

              {/* Comments */}
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Comments</h3>
                {r.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
                <ul className="grid gap-2">
                  {r.comments.map((c) => (
                    <li key={c.id} className="rounded-xl bg-muted/60 p-3 text-sm">
                      <p className="mb-0.5 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{c.author ? fullName(c.author) : "Someone"}</span> · {chatTime(c.created_at)}
                      </p>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <form
                    className="flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!comment.trim()) return;
                      setBusy(true);
                      const res = await addMaterialComment(r.id, { body: comment });
                      setBusy(false);
                      if (!res.ok) return void toast.error(res.error);
                      setComment("");
                      await load();
                    }}
                  >
                    <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ask or answer a question…" aria-label="Write a comment" rows={2} maxLength={4000} className="min-h-11" />
                    <Button type="submit" size="icon" aria-label="Send comment" disabled={busy || !comment.trim()}>
                      <Send />
                    </Button>
                  </form>
                )}
              </section>

              {/* History */}
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
                <ul className="grid gap-1 text-sm">
                  {r.events.map((e, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{e.actor ? fullName(e.actor) : "Someone"}</span> {e.kind === "document" ? `added ${e.detail ?? "a document"}` : (EVENT_LABEL[e.kind] ?? e.kind)}
                      {e.detail && e.kind !== "document" ? ` — ${e.detail}` : ""} · {chatTime(e.created_at)}
                    </li>
                  ))}
                </ul>
              </section>

              {dialog === "ordered" && <OrderedDialog r={r} busy={busy} onClose={() => setDialog(null)} onSave={(v) => change({ status: "ordered", ...v }, r.status === "requested" ? "Marked ordered" : "Order details saved")} />}
              {receiving && (
                <ReceiveDialog
                  r={r}
                  onClose={() => setReceiving(false)}
                  onDone={() => {
                    void load();
                    onChanged();
                  }}
                />
              )}
              {dialog === "delivery" && <DeliveryDialog r={r} busy={busy} onClose={() => setDialog(null)} onSave={(v) => change(v, v.status === "delivered" ? "Marked delivered" : "Partial delivery recorded")} />}
              {dialog === "reject" && <RejectDialog busy={busy} onClose={() => setDialog(null)} onSave={(reason) => change({ status: "rejected", reject_reason: reason }, "Request rejected")} />}
              <Lightbox
                photos={r.photos.map((p) => ({ id: p.id, full_url: p.url, thumb_url: p.thumb_url, meta: `Material request #${r.number}` }))}
                index={photo}
                onClose={() => setPhoto(null)}
              />
            </>
          )}
        </div>
        {confirmDialog}
      </SheetContent>
    </Sheet>
  );
}

function OrderedDialog({ r, busy, onClose, onSave }: { r: MaterialRequestDetail; busy: boolean; onClose: () => void; onSave: (v: { supplier: string; po_number: string; expected_date: string | null }) => Promise<boolean> }) {
  const [supplier, setSupplier] = useState(r.supplier ?? "");
  const [po, setPo] = useState(r.po_number ?? "");
  const [expected, setExpected] = useState(r.expected_date ?? r.needed_by ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={r.status === "requested" ? "Mark as ordered" : "Order details"} description="The person who asked is told it's on its way.">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSave({ supplier, po_number: po, expected_date: expected || null })) onClose();
          }}
        >
          <label className="grid gap-1 text-sm font-medium">
            Supplier (optional)
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={200} placeholder="e.g. Build Supplies Ltd" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            PO number (optional)
            <Input value={po} onChange={(e) => setPo(e.target.value)} maxLength={100} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Expected delivery (optional)
            <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDialog({ r, busy, onClose, onSave }: { r: MaterialRequestDetail; busy: boolean; onClose: () => void; onSave: (v: { status: "delivered" | "partly_delivered"; deliveries: { item_id: string; delivered_qty: number }[] }) => Promise<boolean> }) {
  const [got, setGot] = useState<Record<string, string>>(Object.fromEntries(r.items.map((i) => [i.id, String(Number(i.delivered_qty) > 0 ? Number(i.delivered_qty) : Number(i.quantity))])));
  const deliveries = r.items.map((i) => ({ item_id: i.id, delivered_qty: Math.max(0, Number(got[i.id]) || 0) }));
  const all = r.items.every((i) => (Number(got[i.id]) || 0) >= Number(i.quantity));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Record delivery" description="How much of each item has arrived? Change any that came short." className="max-w-lg">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSave({ status: all ? "delivered" : "partly_delivered", deliveries })) onClose();
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
                  aria-label={`Delivered quantity of ${i.name}`}
                  className="w-24 text-right"
                />
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{all ? "Everything has arrived — it will be marked Delivered." : "Some items came short — it will be marked Partly delivered."}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setGot(Object.fromEntries(r.items.map((i) => [i.id, String(Number(i.quantity))])))}>
              <CheckCheck aria-hidden /> All arrived
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Save delivery
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Reject this request" description="The person who asked will see your reason.">
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSave(reason)) onClose();
          }}
        >
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. We already have these in the store — collect from the yard." aria-label="Reason" maxLength={500} rows={3} required />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || !reason.trim()}>
              Reject
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
