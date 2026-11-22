"use client";

import { FileText, Images, Loader2, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { loadChannelMedia } from "@/app/(app)/chats/actions";
import { Lightbox } from "@/components/diary/lightbox";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { chatTime } from "@/lib/chat";
import { cn } from "@/lib/utils";
import type { ChatMediaItem } from "@/types/chat";

type Kind = "photos" | "files";
const who = (a: ChatMediaItem) => [a.author?.first_name, a.author?.last_name].filter(Boolean).join(" ") || "Someone";
const size = (b: number | null) => (!b ? "" : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const monthLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/Malta" }).format(new Date(iso));

/** Every photo and file shared in a chat (like WhatsApp's "Media and docs"). */
export function ChatMedia({
  channelId,
  open,
  onClose,
  onGoToMessage,
  loader = loadChannelMedia,
}: {
  channelId: string;
  open: boolean;
  onClose: () => void;
  onGoToMessage: (item: ChatMediaItem) => void;
  /** Overridable for the development preview. */
  loader?: typeof loadChannelMedia;
}) {
  const [kind, setKind] = useState<Kind>("photos");
  const [items, setItems] = useState<Record<Kind, ChatMediaItem[] | null>>({ photos: null, files: null });
  const [more, setMore] = useState<Record<Kind, boolean>>({ photos: false, files: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  const load = async (k: Kind, before?: string) => {
    setBusy(true);
    const res = await loader(channelId, k, before ?? null);
    setBusy(false);
    if (!res.ok) return void setError(res.error);
    const got = res.data ?? [];
    setItems((x) => ({ ...x, [k]: before ? [...(x[k] ?? []), ...got] : got }));
    setMore((x) => ({ ...x, [k]: got.length >= 60 }));
  };

  // Fresh each time it's opened (new photos may have been shared).
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when reopened
    setItems({ photos: null, files: null });
    setError(null);
    void load("photos");
    void load("files");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable enough for this
  }, [open, channelId]);

  const list = items[kind];
  const groups: { label: string; items: { a: ChatMediaItem; i: number }[] }[] = [];
  (list ?? []).forEach((a, i) => {
    const label = monthLabel(a.created_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push({ a, i });
    else groups.push({ label, items: [{ a, i }] });
  });
  const go = (a: ChatMediaItem) => {
    setViewing(null);
    onClose();
    onGoToMessage(a);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent title="Photos & files" description="Everything shared in this chat, newest first">
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 pb-6 pt-3 md:px-6 md:pt-5">
          <h2 className="pr-12 text-xl font-bold" aria-hidden>
            Photos &amp; files
          </h2>
          <div role="tablist" aria-label="Photos or files" className="grid grid-cols-2 rounded-lg border bg-card p-0.5">
            {(
              [
                { k: "photos", label: "Photos", icon: Images },
                { k: "files", label: "Files", icon: FileText },
              ] as const
            ).map(({ k, label, icon: Icon }) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn("flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium", kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="size-4" aria-hidden /> {label}
                {items[k] && <span className="text-xs">({items[k]!.length}{more[k] ? "+" : ""})</span>}
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {error ? (
              <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
            ) : !list ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
              </p>
            ) : list.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                {kind === "photos" ? "No photos have been shared in this chat yet." : "No files have been shared in this chat yet."}
              </p>
            ) : (
              <div className="grid gap-5">
                {groups.map((g) => (
                  <section key={g.label}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
                    {kind === "photos" ? (
                      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                        {g.items.map(({ a, i }) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              onClick={() => setViewing(i)}
                              className="block aspect-square w-full overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Photo from ${who(a)}, ${chatTime(a.created_at)}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs */}
                              <img src={a.thumb_url ?? a.url ?? ""} alt="" loading="lazy" className="size-full object-cover" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="grid gap-2">
                        {g.items.map(({ a }) => (
                          <li key={a.id} className="flex items-center gap-1 rounded-xl border bg-card pr-1">
                            <a href={a.url ?? "#"} target="_blank" rel="noopener" className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 hover:underline">
                              <FileText className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{a.file_name}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {[size(a.size_bytes), who(a), chatTime(a.created_at)].filter(Boolean).join(" · ")}
                                </span>
                              </span>
                            </a>
                            <Button variant="ghost" size="icon" onClick={() => go(a)} aria-label={`Go to the message with ${a.file_name}`}>
                              <MessageSquareText />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
                {more[kind] && (
                  <Button variant="outline" className="justify-self-center" disabled={busy} onClick={() => void load(kind, list[list.length - 1].created_at)}>
                    {busy && <Loader2 className="animate-spin" aria-hidden />} Show older
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <Lightbox
          photos={(items.photos ?? []).map((a) => ({ id: a.id, full_url: a.url, thumb_url: a.thumb_url, meta: `${who(a)} · ${chatTime(a.created_at)}` }))}
          index={viewing}
          onClose={() => setViewing(null)}
          action={{ label: "Go to message", onClick: (i) => items.photos?.[i] && go(items.photos[i]) }}
        />
      </SheetContent>
    </Sheet>
  );
}
