"use client";

import {
  Bell,
  ChevronDown,
  ClipboardPenLine,
  FolderKanban,
  GanttChartSquare,
  Headset,
  House,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  MapPin,
  Package,
  MessagesSquare,
  NotebookTabs,
  Rocket,
  Search,
  Share2,
  ShieldCheck,
  Table2,
  UserRound,
  Users,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { hasRole, ROLE_LABEL } from "@/lib/auth/roles";
import type { HelpTopic } from "@/lib/help";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/database";

const ICONS: Record<string, LucideIcon> = {
  Bell, ClipboardPenLine, FolderKanban, GanttChartSquare, Headset, House, LayoutDashboard, ListChecks, MessagesSquare,
  NotebookTabs, Package, Rocket, Share2, ShieldCheck, Table2, UserRound, Users, WifiOff,
};

/** Shows **bold** parts of a help sentence in bold. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const plain = (s: string) => s.replace(/\*\*/g, "").toLowerCase();

export function HelpView({ topics, role }: { topics: HelpTopic[]; role: AppRole }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // Open the guide named in the address (e.g. /help#daily-update).
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      setOpen(id);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  // Only what this person can actually do.
  const mine = useMemo(
    () =>
      topics
        .filter((t) => !t.minRole || hasRole(role, t.minRole))
        .map((t) => ({ ...t, guides: t.guides.filter((g) => !g.minRole || hasRole(role, g.minRole)) }))
        .filter((t) => t.guides.length > 0),
    [topics, role],
  );

  const term = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return null;
    return mine.flatMap((t) =>
      t.guides
        .filter((g) => [t.title, g.title, ...g.steps, g.tip ?? ""].some((s) => plain(s).includes(term)))
        .map((g) => ({ topic: t, guide: g })),
    );
  }, [mine, term]);

  return (
    <div className="grid gap-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help, e.g. photo, password, export" aria-label="Search help" className="px-9" />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-0 top-0 flex size-11 items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>

      {results ? (
        <section aria-live="polite" className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {results.length === 0 ? "Nothing found. Try another word, or ask your manager." : `${results.length} ${results.length === 1 ? "guide" : "guides"} found`}
          </p>
          {results.map(({ topic, guide }) => (
            <article key={`${topic.id}-${guide.title}`} className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{topic.title}</p>
              <GuideBody guide={guide} />
            </article>
          ))}
        </section>
      ) : (
        <>
          <nav aria-label="Help topics" className="flex flex-wrap gap-2">
            {mine.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="inline-flex h-11 items-center rounded-full border bg-card px-4 text-sm font-medium hover:bg-accent"
              >
                {t.title}
              </a>
            ))}
          </nav>

          <div className="grid gap-3">
            {mine.map((t) => {
              const Icon = ICONS[t.icon] ?? Lightbulb;
              const isOpen = open === t.id;
              return (
                <section key={t.id} id={t.id} className="scroll-mt-20 rounded-xl border bg-card">
                  <h2>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(isOpen ? null : t.id);
                        history.replaceState(null, "", isOpen ? window.location.pathname : `#${t.id}`);
                      }}
                      aria-expanded={isOpen}
                      aria-controls={`${t.id}-panel`}
                      className="flex min-h-16 w-full items-center gap-3 p-4 text-left"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold">{t.title}</span>
                        <span className="block text-sm font-normal text-muted-foreground">{t.summary}</span>
                      </span>
                      <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                    </button>
                  </h2>
                  {isOpen && (
                    <div id={`${t.id}-panel`} className="grid gap-5 border-t px-4 pb-5 pt-4">
                      {t.where && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="size-4 shrink-0" aria-hidden /> Where: {t.where}
                        </p>
                      )}
                      {t.guides.map((g) => (
                        <GuideBody key={g.title} guide={g} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            You&apos;re seeing the guides for your level (<strong>{ROLE_LABEL[role]}</strong>). Still stuck? Ask your manager or an administrator.
          </p>
        </>
      )}
    </div>
  );
}

function GuideBody({ guide }: { guide: HelpTopic["guides"][number] }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold">{guide.title}</h3>
      <ol className="grid gap-2">
        {guide.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-muted-foreground">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 pt-px">
              <Rich text={s} />
            </span>
          </li>
        ))}
      </ol>
      {guide.tip && (
        <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">Tip: </span>
            <Rich text={guide.tip} />
          </span>
        </p>
      )}
    </div>
  );
}
