"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useEffect, useRef, useState } from "react";

export type LightboxPhoto = { id: string; full_url?: string | null; thumb_url?: string | null; caption?: string | null; meta?: string };

/** Full-screen photo viewer: swipe or use the arrows / keyboard to move between photos. */
export function Lightbox({
  photos,
  index,
  onClose,
  action,
}: {
  photos: LightboxPhoto[];
  index: number | null;
  onClose: () => void;
  /** Optional button under the photo, e.g. "Go to message". */
  action?: { label: string; onClick: (photoIndex: number) => void };
}) {
  const [i, setI] = useState(index ?? 0);
  const touchX = useRef<number | null>(null);
  const touchY = useRef<number | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- jump to the photo that was tapped
  useEffect(() => setI(index ?? 0), [index]);
  const open = index !== null && photos.length > 0;
  const go = (d: number) => setI((x) => (x + d + photos.length) % photos.length);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Android back button / gesture closes the photo instead of leaving the page.
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...(window.history.state ?? {}), orionPhoto: true }, "");
    const onBack = () => closeRef.current();
    window.addEventListener("popstate", onBack);
    return () => {
      window.removeEventListener("popstate", onBack);
      if (window.history.state?.orionPhoto) window.history.back(); // closed with a button: undo our history entry
    };
  }, [open]);

  const p = open ? photos[Math.min(i, photos.length - 1)] : null;
  const save = () => p?.full_url && window.open(p.full_url, "_blank", "noopener");
  const pill = "flex h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-medium text-white hover:bg-white/25";
  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black" />
        <D.Content
          className="fixed inset-0 z-[60] flex flex-col bg-black outline-none"
          onTouchStart={(e) => {
            touchX.current = e.touches[0].clientX;
            touchY.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            if (touchX.current === null || touchY.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            const dy = e.changedTouches[0].clientY - touchY.current;
            touchX.current = touchY.current = null;
            if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return onClose(); // swipe down to close
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          }}
          // Taps here must never reach the page (or chat message) underneath.
          onClick={(e) => e.stopPropagation()}
        >
          <D.Title className="sr-only">Photo {i + 1} of {photos.length}</D.Title>
          <D.Description className="sr-only">{p?.caption || p?.meta || "Site photo"}</D.Description>
          <div className="relative z-10 flex shrink-0 items-center justify-between p-2 pt-[max(env(safe-area-inset-top),0.5rem)] text-white">
            <span className="px-3 text-sm">
              {i + 1} / {photos.length}
            </span>
            <div className="flex">
              {p?.full_url && (
                <button type="button" onClick={save} className="flex size-12 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Open the full-size photo">
                  <Download className="size-5" />
                </button>
              )}
              <button type="button" onClick={onClose} className="flex size-12 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Close">
                <X className="size-6" />
              </button>
            </div>
          </div>
          {/* The photo is positioned inside this box, so it can never cover the buttons. Tapping the dark area closes. */}
          <div className="relative min-h-0 flex-1 overflow-hidden" onClick={(e) => e.target === e.currentTarget && onClose()}>
            {p && (
              // eslint-disable-next-line @next/next/no-img-element -- signed URLs
              <img
                key={p.id}
                src={p.full_url ?? p.thumb_url ?? ""}
                alt={p.caption || p.meta || "Site photo"}
                className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
                style={{ backgroundImage: p.thumb_url ? `url(${p.thumb_url})` : undefined, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" }}
              />
            )}
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:flex">
                  <ChevronLeft className="size-6" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:flex">
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
          <div className="relative z-10 grid shrink-0 justify-items-center gap-3 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
            {(p?.caption || p?.meta) && <p className="text-center text-sm text-white/80">{[p?.caption, p?.meta].filter(Boolean).join(" · ")}</p>}
            <div className="flex flex-wrap justify-center gap-2">
              {action && (
                <button type="button" onClick={() => action.onClick(i)} className={pill}>
                  {action.label}
                </button>
              )}
              {p?.full_url && (
                <button type="button" onClick={save} className={pill}>
                  <Download className="size-4" aria-hidden /> Save photo
                </button>
              )}
              <button type="button" onClick={onClose} className={pill}>
                <X className="size-4" aria-hidden /> Close
              </button>
            </div>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** A grid of photo thumbnails; tapping one opens the lightbox. */
export function PhotoGrid({ photos, meta, max }: { photos: LightboxPhoto[]; meta?: string; max?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  const shown = max ? photos.slice(0, max) : photos;
  const extra = photos.length - shown.length;
  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {shown.map((p, idx) => (
          <li key={p.id} className="relative">
            <button
              type="button"
              onClick={() => setOpen(idx)}
              className="block aspect-square w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open photo ${idx + 1} of ${photos.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs */}
              <img src={p.thumb_url ?? ""} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              {extra > 0 && idx === shown.length - 1 && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-lg font-semibold text-white">+{extra}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Lightbox photos={photos.map((p) => ({ ...p, meta: p.meta ?? meta }))} index={open} onClose={() => setOpen(null)} />
    </>
  );
}
