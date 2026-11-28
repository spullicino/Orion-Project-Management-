"use client";

import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  LayoutDashboard,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { saveHomeLayout } from "@/app/(app)/home/layout-actions";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ORDER,
  HOME_CARD_LABEL,
  moveCard,
  type HomeCardId,
  type HomeLayout,
} from "@/lib/home-layout";
import { cn } from "@/lib/utils";

export type HomeCard = { id: HomeCardId; node: React.ReactNode };
const PAIR: (HomeCardId | undefined)[] = ["daily", "materials"];

/** Home's cards in this person's own order, with "Arrange" to move and hide them. */
export function HomeCards({
  cards,
  initial,
}: {
  cards: HomeCard[];
  initial: HomeLayout;
}) {
  const [layout, setLayout] = useState<HomeLayout>(initial);
  const [arranging, setArranging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<HomeCardId | null>(null);
  const rows = useRef(new Map<HomeCardId, HTMLLIElement>());
  const byId = new Map(cards.map((c) => [c.id, c]));

  const persist = async (next: HomeLayout | null) => {
    setSaving(true);
    const res = await saveHomeLayout(next);
    setSaving(false);
    if (!res.ok) toast.error(res.error ?? "Couldn't save");
  };
  const update = (next: HomeLayout) => setLayout(next);

  if (!arranging) {
    return (
      <div className="grid gap-0">
        <div className="-mt-2 mb-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setArranging(true)}>
            <LayoutDashboard aria-hidden /> Arrange
          </Button>
        </div>
        {(() => {
          // "Daily updates" and "Material requests" next to each other sit side by side on wider screens.
          const shown = layout.order.filter(
            (id) => !layout.hidden.includes(id) && byId.get(id)?.node,
          );
          const out: React.ReactNode[] = [];
          for (let i = 0; i < shown.length; i++) {
            const id = shown[i];
            const pair =
              PAIR.includes(id) && PAIR.includes(shown[i + 1])
                ? shown[i + 1]
                : null;
            if (pair) {
              out.push(
                <div
                  key={`${id}+${pair}`}
                  className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2"
                >
                  {byId.get(id)!.node}
                  {byId.get(pair)!.node}
                </div>,
              );
              i++;
            } else
              out.push(
                <div key={id} className="mb-4">
                  {byId.get(id)!.node}
                </div>,
              );
          }
          return out;
        })()}
      </div>
    );
  }

  return (
    <section
      aria-label="Arrange your Home"
      className="mb-4 grid gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-card p-4"
    >
      <div>
        <h2 className="text-base font-semibold">Arrange your Home</h2>
        <p className="text-sm text-muted-foreground">
          Drag the cards with ⋮⋮ (or use the arrows) to put them in the order
          you want. Tap the eye to hide a card. Saved to your account, on all
          your devices.
        </p>
      </div>
      <ol className="grid gap-2" aria-label="Home cards">
        {layout.order.map((id, i) => {
          const hidden = layout.hidden.includes(id);
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) rows.current.set(id, el);
                else rows.current.delete(id);
              }}
              className={cn(
                "flex min-h-14 items-center gap-2 rounded-xl border bg-background px-2 py-1.5",
                dragId === id &&
                  "border-primary shadow-lg ring-2 ring-primary/30",
                hidden && "opacity-60",
              )}
            >
              <button
                type="button"
                aria-label={`Drag to move ${HOME_CARD_LABEL[id]}`}
                className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-accent active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).setPointerCapture(
                    e.pointerId,
                  );
                  setDragId(id);
                }}
                onPointerMove={(e) => {
                  if (dragId !== id) return;
                  // The new place = how many other cards are above the finger.
                  let target = 0;
                  for (const other of layout.order) {
                    if (other === id) continue;
                    const r = rows.current.get(other)?.getBoundingClientRect();
                    if (r && e.clientY > r.top + r.height / 2) target++;
                  }
                  if (layout.order.indexOf(id) !== target)
                    update({
                      ...layout,
                      order: moveCard(layout.order, id, target),
                    });
                }}
                onPointerUp={() => setDragId(null)}
                onPointerCancel={() => setDragId(null)}
              >
                <GripVertical className="size-5" aria-hidden />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium leading-tight">
                  {HOME_CARD_LABEL[id]}
                </span>
                {hidden && (
                  <span className="block text-xs text-muted-foreground">
                    Hidden
                  </span>
                )}
                {!hidden && !byId.get(id)?.node && (
                  <span className="block text-xs text-muted-foreground">
                    Shows when there&apos;s something in it
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${HOME_CARD_LABEL[id]} up`}
                disabled={i === 0}
                onClick={() =>
                  update({
                    ...layout,
                    order: moveCard(layout.order, id, i - 1),
                  })
                }
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move ${HOME_CARD_LABEL[id]} down`}
                disabled={i === layout.order.length - 1}
                onClick={() =>
                  update({
                    ...layout,
                    order: moveCard(layout.order, id, i + 1),
                  })
                }
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  hidden
                    ? `Show ${HOME_CARD_LABEL[id]}`
                    : `Hide ${HOME_CARD_LABEL[id]}`
                }
                aria-pressed={hidden}
                onClick={() =>
                  update({
                    ...layout,
                    hidden: hidden
                      ? layout.hidden.filter((x) => x !== id)
                      : [...layout.hidden, id],
                  })
                }
              >
                {hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={async () => {
            const reset: HomeLayout = {
              order: DEFAULT_ORDER.filter((id) => layout.order.includes(id)),
              hidden: [],
            };
            setLayout(reset);
            await persist(null);
            toast.success("Back to the standard Home");
          }}
        >
          <RotateCcw aria-hidden /> Reset to default
        </Button>
        <Button
          disabled={saving}
          onClick={async () => {
            await persist(layout);
            setArranging(false);
          }}
        >
          {saving && <Loader2 className="animate-spin" aria-hidden />} Done
        </Button>
      </div>
    </section>
  );
}
