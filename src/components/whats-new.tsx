"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { markWhatsNewSeen } from "@/app/(app)/home/whats-new-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { hasUnseen, isNewEntry, newerSeen, type WhatsNewEntry } from "@/lib/whats-new";

const KEY = "orion:whats-new-seen";
const dateLabel = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** "What's new" button (with a red dot for unseen updates) and the list of updates by date. */
export function WhatsNewButton({ entries, seen, preview = false }: { entries: WhatsNewEntry[]; seen: string | null; /** dev preview: don't save */ preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(seen);

  // Also check this device, in case the account hasn't caught up yet.
  useEffect(() => {
    try {
      const local = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this device
      if (local) setLastSeen(newerSeen(entries, seen, local));
    } catch {
      /* storage unavailable */
    }
  }, [seen, entries]);

  const unseen = hasUnseen(entries, lastSeen);
  const newestSeenBefore = lastSeen;

  const openList = () => {
    setOpen(true);
    if (!unseen || !entries[0]) return;
    const latest = entries[0].id;
    try {
      localStorage.setItem(KEY, latest);
    } catch {
      /* ignore */
    }
    if (!preview) void markWhatsNewSeen(latest);
  };

  // Group by date (entries are newest first).
  const days: { date: string; items: WhatsNewEntry[] }[] = [];
  for (const e of entries) {
    const last = days[days.length - 1];
    if (last?.date === e.date) last.items.push(e);
    else days.push({ date: e.date, items: [e] });
  }

  return (
    <>
      <Button variant="outline" onClick={openList} className="relative" aria-label={unseen ? "What's new (new updates)" : "What's new"}>
        <Sparkles aria-hidden className="text-primary" /> What&apos;s new
        {unseen && <span className="absolute -right-1 -top-1 size-3 rounded-full bg-destructive ring-2 ring-background" aria-hidden />}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && entries[0]) setLastSeen(entries[0].id); // dot goes once the list has been seen
        }}
      >
        <DialogContent title="What's new" description="New features and improvements, newest first." className="max-w-lg">
          <ol className="grid gap-6">
            {days.map((day) => (
              <li key={day.date}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{dateLabel(day.date)}</h3>
                <ul className="grid gap-3">
                  {day.items.map((e) => {
                    const isNew = isNewEntry(entries, newestSeenBefore, entries.indexOf(e));
                    return (
                      <li key={e.id} className="rounded-xl border p-3">
                        <p className="flex items-center gap-2 font-semibold">
                          {e.title}
                          {isNew && <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold text-white">New</span>}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{e.body}</p>
                        {e.help && (
                          <Link href={e.help} onClick={() => setOpen(false)} className="mt-2 inline-flex h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">
                            How to use it <ArrowRight className="size-4" aria-hidden />
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
