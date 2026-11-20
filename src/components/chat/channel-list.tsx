"use client";

import { BellOff, Building2, Megaphone, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createChannel } from "@/app/(app)/chats/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { listTime } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { readableTextOn } from "@/lib/utils";
import type { ChannelSummary } from "@/types/chat";

const SECTIONS: { type: ChannelSummary["type"]; label: string }[] = [
  { type: "general", label: "Company" },
  { type: "management", label: "Management" },
  { type: "project", label: "Projects" },
];

function ChannelIcon({ c }: { c: ChannelSummary }) {
  if (c.type === "project")
    return (
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
        style={{ background: c.project_color ?? "#64748b", color: readableTextOn(c.project_color ?? "#64748b") }}
        aria-hidden
      >
        {c.name.slice(0, 2).toUpperCase()}
      </span>
    );
  const Icon = c.type === "general" ? Megaphone : ShieldCheck;
  return (
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", c.type === "general" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary")}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

function preview(c: ChannelSummary) {
  if (!c.last) return "No messages yet";
  if (c.last.deleted) return "Message deleted";
  const text = c.last.body || (c.last.has_attachments ? "📎 Photo or file" : "");
  return c.last.author ? `${c.last.author.split(" ")[0]}: ${text}` : text;
}

export function ChannelList({ channels, activeId, canCreate }: { channels: ChannelSummary[]; activeId?: string | null; canCreate: boolean }) {
  return (
    <nav aria-label="Chats" className="grid min-w-0 gap-5">
      {SECTIONS.map((s) => {
        const items = channels.filter((c) => c.type === s.type);
        if (!items.length && !(canCreate && s.type === "management")) return null;
        return (
          <section key={s.type} className="min-w-0">
            <div className="mb-1 flex items-center justify-between px-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</h2>
              {canCreate && s.type === "management" && <NewChannelButton />}
            </div>
            <ul className="grid min-w-0 gap-0.5">
              {items.map((c) => (
                <li key={c.id} className="min-w-0">
                  <Link
                    href={`/chats/${c.id}`}
                    aria-current={activeId === c.id ? "page" : undefined}
                    className={cn("flex min-w-0 items-center gap-3 rounded-xl p-2 hover:bg-accent", activeId === c.id && "bg-primary/10")}
                  >
                    <ChannelIcon c={c} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate", c.unread > 0 ? "font-bold" : "font-medium")}>{c.name}</span>
                        {c.muted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Muted" />}
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{c.last ? listTime(c.last.created_at) : ""}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate text-sm", c.unread > 0 ? "text-foreground" : "text-muted-foreground")}>{preview(c)}</span>
                        {c.unread > 0 && (
                          <span className={cn("ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-5 text-white", c.muted ? "bg-muted-foreground" : "bg-destructive")}>
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              {!items.length && <li className="px-2 py-2 text-sm text-muted-foreground">No chats yet.</li>}
            </ul>
          </section>
        );
      })}
      {!channels.length && (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Building2 className="size-4" aria-hidden /> You&apos;ll see chats here once you&apos;re added to a project.
        </p>
      )}
    </nav>
  );
}

function NewChannelButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label="New chat">
        <Plus aria-hidden /> New
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent title="New chat" description="Management chats are only visible to administrators and managers. Announcement chats can be read by everyone; only managers write.">
            <form
              className="grid gap-4"
              action={(f) =>
                start(async () => {
                  const res = await createChannel({ name: f.get("name"), description: f.get("description"), type: f.get("type") });
                  if (!res.ok) return void toast.error(res.error);
                  setOpen(false);
                  router.push(`/chats/${res.data!.id}`);
                })
              }
            >
              <FormField id="c-name" label="Name">
                <Input name="name" required maxLength={80} placeholder="e.g. Tenders, Health & Safety" />
              </FormField>
              <FormField id="c-type" label="Who can see it">
                <NativeSelect name="type" defaultValue="management">
                  <option value="management">Managers and administrators only</option>
                  <option value="general">Everyone reads, managers write (announcements)</option>
                </NativeSelect>
              </FormField>
              <FormField id="c-desc" label="Description (optional)">
                <Input name="description" maxLength={500} />
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  Create
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
