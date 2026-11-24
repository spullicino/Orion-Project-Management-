"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { loadPhotos } from "@/app/(app)/daily-update/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, fullName } from "@/lib/utils";
import type { GalleryPhoto } from "@/types/diary";
import { Lightbox } from "./lightbox";

const PAGE = 60;

export function PhotoGallery({
  projectId,
  initial,
}: {
  projectId: string;
  initial: GalleryPhoto[];
}) {
  const [photos, setPhotos] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (from || to) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync server props into local state
    setPhotos(initial);
    setHasMore(initial.length >= PAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the server data changes
  }, [initial]);

  const fetchPage = (f: string, t: string, before: string | null) =>
    start(async () => {
      const res = await loadPhotos({
        project: projectId,
        from: f || null,
        to: t || null,
        before,
      });
      if (!res.ok) return void toast.error(res.error);
      setPhotos((ps) =>
        before ? [...ps, ...(res.data ?? [])] : (res.data ?? []),
      );
      setHasMore((res.data?.length ?? 0) >= PAGE);
    });

  // Group by day for headings.
  const days: { date: string; photos: { p: GalleryPhoto; index: number }[] }[] =
    [];
  photos.forEach((p, index) => {
    const last = days[days.length - 1];
    if (last?.date === p.work_date) last.photos.push({ p, index });
    else days.push({ date: p.work_date, photos: [{ p, index }] });
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 basis-32 gap-1 sm:flex-none text-xs text-muted-foreground">
          From
          <Input
            type="date"
            placeholder="Any date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              fetchPage(e.target.value, to, null);
            }}
            className="w-full sm:w-44"
          />
        </label>
        <label className="grid min-w-0 flex-1 basis-32 gap-1 sm:flex-none text-xs text-muted-foreground">
          To
          <Input
            type="date"
            placeholder="Any date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              fetchPage(from, e.target.value, null);
            }}
            className="w-full sm:w-44"
          />
        </label>
        {(from || to) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom("");
              setTo("");
              fetchPage("", "", null);
            }}
          >
            <X aria-hidden /> Clear
          </Button>
        )}
      </div>

      {photos.length === 0 && !pending && (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No photos{" "}
          {from || to
            ? "in these dates"
            : "yet. Photos from daily updates appear here"}
          .
        </p>
      )}

      {days.map((d) => (
        <section key={d.date} aria-label={formatDate(d.date)}>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            {formatDate(d.date)} · {d.photos.length}{" "}
            {d.photos.length === 1 ? "photo" : "photos"}
          </h2>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {d.photos.map(({ p, index }) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setOpen(index)}
                  className="block aspect-square w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Photo by ${fullName(p.author)}, ${formatDate(p.work_date)}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs */}
                  <img
                    src={p.thumb_url ?? ""}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {hasMore && (
        <Button
          variant="outline"
          disabled={pending}
          className="justify-self-center"
          onClick={() =>
            fetchPage(from, to, photos[photos.length - 1]?.created_at ?? null)
          }
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />} Show
          more photos
        </Button>
      )}

      <Lightbox
        photos={photos.map((p) => ({
          ...p,
          meta: `${fullName(p.author)} · ${formatDate(p.work_date)}`,
        }))}
        index={open}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
