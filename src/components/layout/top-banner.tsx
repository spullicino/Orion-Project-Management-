"use client";

import { BellRing, ChevronLeft, ChevronRight, Info, TriangleAlert, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BANNER_ROTATE_SECONDS, BANNER_TONES, type BannerItem, type BannerTone } from "@/lib/banner";
import { cn } from "@/lib/utils";
import { getMyBanner } from "./top-banner-actions";

const ICON: Record<BannerTone, typeof Info> = { info: Info, reminder: BellRing, urgent: TriangleAlert };
const live = (b: BannerItem, now: number) => !b.ends_at || new Date(b.ends_at).getTime() > now;

/** Look of one message — also used for the preview in Admin → Banner. */
export function BannerStrip({
  item,
  count = 1,
  index = 0,
  onPrev,
  onNext,
  onDot,
  preview,
  fadeKey,
}: {
  item: Pick<BannerItem, "body" | "link" | "tone">;
  fadeKey?: string;
  count?: number;
  index?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onDot?: (i: number) => void;
  preview?: boolean;
}) {
  const Icon = ICON[item.tone];
  const external = !!item.link && /^https?:\/\//i.test(item.link);
  const text = (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="line-clamp-2 min-w-0 break-words text-sm font-medium leading-snug sm:line-clamp-none">{item.body || "Your message"}</span>
      {item.link && (external ? <ExternalLink className="size-3.5 shrink-0 opacity-80" aria-hidden /> : <ChevronRight className="size-4 shrink-0 opacity-80" aria-hidden />)}
    </span>
  );
  const content =
    item.link && !preview ? (
      external ? (
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 flex-1 items-center py-1.5 underline-offset-2 hover:underline">
          {text}
        </a>
      ) : (
        <Link href={item.link} className="flex min-h-11 min-w-0 flex-1 items-center py-1.5 underline-offset-2 hover:underline">
          {text}
        </Link>
      )
    ) : (
      <div className="flex min-h-11 min-w-0 flex-1 items-center py-1.5">{text}</div>
    );
  return (
    <div className={cn("flex items-center gap-1 px-2 md:px-6", BANNER_TONES[item.tone].className)}>
      {count > 1 && (
        <button type="button" onClick={onPrev} aria-label="Previous message" className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-black/10">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      )}
      <div key={fadeKey} className={cn("flex min-w-0 flex-1 items-center", fadeKey && "banner-fade", count <= 1 && "pl-2")}>
        {content}
      </div>
      {count > 1 && (
        <>
          <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden={!onDot}>
            {Array.from({ length: count }, (_, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                onClick={() => onDot?.(i)}
                aria-label={`Message ${i + 1}`}
                className={cn("size-2 rounded-full bg-current", i === index ? "opacity-100" : "opacity-40")}
              />
            ))}
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums opacity-80 sm:hidden">
            {index + 1}/{count}
          </span>
          <button type="button" onClick={onNext} aria-label="Next message" className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-black/10">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

/** Strip at the top of every screen with the administrators' messages, one after another. */
export function TopBanner({ initial }: { initial: BannerItem[] }) {
  // What the server sent with the page, unless we've fetched something newer since then.
  const [fetched, setFetched] = useState<{ from: BannerItem[]; items: BannerItem[] } | null>(null);
  const items = fetched && fetched.from === initial ? fetched.items : initial;
  const [now, setNow] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [hold, setHold] = useState(false);
  const touchX = useRef<number | null>(null);

  // New or changed messages: when the app comes back to the front, and every 5 minutes.
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      getMyBanner()
        .then((list) => alive && setFetched({ from: initial, items: list }))
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", refresh);
    const t = window.setInterval(refresh, 5 * 60_000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(t);
    };
  }, [initial]);

  const shown = items.filter((b) => live(b, now));
  const count = shown.length;
  const i = count ? index % count : 0;

  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (!hold) setIndex((x) => x + 1);
    }, BANNER_ROTATE_SECONDS * 1000);
    return () => window.clearInterval(t);
  }, [hold]);

  if (!count) return null;
  const go = (d: number) => setIndex((x) => (((x % count) + d) % count + count) % count);
  const item = shown[i];

  return (
    <div
      role="region"
      aria-label="Announcements"
      aria-roledescription="carousel"
      className="sticky top-14 z-20 md:top-0"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={() => setHold(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start == null || count < 2) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <BannerStrip item={item} fadeKey={item.id} count={count} index={i} onPrev={() => go(-1)} onNext={() => go(1)} onDot={(n) => setIndex(n)} />
    </div>
  );
}
