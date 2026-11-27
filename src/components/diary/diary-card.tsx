"use client";

import { AlertTriangle, Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteDailyUpdate, updateDailyUpdate } from "@/app/(app)/daily-update/actions";
import { getDailyCommentCounts } from "@/app/(app)/daily-update/comment-actions";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, fullName } from "@/lib/utils";
import type { DailyUpdate } from "@/types/diary";
import { DiaryComments } from "./diary-comments";
import { PhotoGrid } from "./lightbox";

const timeOf = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));

/** Author within 24 hours, or a manager. The database enforces the same rule. */
export function canModify(u: DailyUpdate, me: { id: string; isManager: boolean }) {
  return me.isManager || (u.author_id === me.id && Date.now() - new Date(u.created_at).getTime() < 24 * 3600 * 1000);
}

export function DiaryCard({
  update,
  me,
  showProject,
  commentCount = 0,
  openComments = false,
}: {
  update: DailyUpdate;
  me: { id: string; isManager: boolean };
  showProject?: boolean;
  commentCount?: number;
  /** Opened from a notification about a comment. */
  openComments?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const editable = canModify(update, me);
  const name = fullName(update.author);

  return (
    <article id={`update-${update.id}`} className="scroll-mt-20 rounded-xl border bg-card p-4">
      <header className="mb-3 flex items-start gap-3">
        <UserAvatar person={update.author} src={update.author_avatar_src} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{name}</p>
          {showProject && (
            <Link href={`/projects/${update.project_id}/diary`} className="flex min-w-0 items-center gap-1.5 text-sm font-medium hover:underline">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: update.project.color }} aria-hidden />
              <span className="truncate">{update.project.name}</span>
            </Link>
          )}
          <p className="text-sm text-muted-foreground">
            {formatDate(update.work_date)} · posted {timeOf(update.created_at)}
            {update.hours !== null && <span className="font-semibold text-foreground sm:hidden"> · {Number(update.hours)} h</span>}
          </p>
        </div>
        {update.hours !== null && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold sm:inline-flex">
            <Clock className="size-3.5" aria-hidden /> {Number(update.hours)} h
          </span>
        )}
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Options for this update" className="-mr-2 -mt-2">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil /> Edit text
              </DropdownMenuItem>
              <DropdownMenuItem
                destructive
                onSelect={async () => {
                  if (!(await confirm("Delete this daily update?", { body: "Its photos are deleted too. This can't be undone." }))) return;
                  const res = await deleteDailyUpdate(update.id);
                  if (res.ok) toast.success("Update deleted");
                  else toast.error(res.error);
                }}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <p className="whitespace-pre-wrap break-words">{update.work_done}</p>
      {update.issues && (
        <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <p className="whitespace-pre-wrap break-words">
            <span className="font-semibold">Issues / delays: </span>
            {update.issues}
          </p>
        </div>
      )}
      {update.photos.length > 0 && (
        <div className="mt-3">
          <PhotoGrid photos={update.photos} meta={`${name} · ${formatDate(update.work_date)}`} max={8} />
        </div>
      )}

      <DiaryComments updateId={update.id} count={commentCount} me={me} startOpen={openComments} />

      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && (
          <DialogContent title="Edit daily update" description="You can edit your own update for 24 hours after posting.">
            <form
              className="grid gap-4"
              action={(f) =>
                start(async () => {
                  const res = await updateDailyUpdate(update.id, { work_done: f.get("work_done"), hours: f.get("hours"), issues: f.get("issues") });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Update saved");
                  setEditing(false);
                })
              }
            >
              <FormField id="e-work" label="Work done">
                <Textarea name="work_done" defaultValue={update.work_done} required maxLength={8000} className="min-h-32" />
              </FormField>
              <FormField id="e-hours" label="Hours (optional)">
                <Input name="hours" type="number" inputMode="decimal" min={0} max={24} step={0.5} defaultValue={update.hours ?? ""} />
              </FormField>
              <FormField id="e-issues" label="Issues / delays (optional)">
                <Textarea name="issues" defaultValue={update.issues ?? ""} maxLength={4000} />
              </FormField>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  Save
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
      {dialog}
    </article>
  );
}

/** Updates grouped under day headings. */
export function DiaryDays({ updates, me, showProject }: { updates: DailyUpdate[]; me: { id: string; isManager: boolean }; showProject?: boolean }) {
  // Comment counts for the "Comments (2)" buttons, and the update a notification opened.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const idsKey = updates.map((u) => u.id).join(",");
  useEffect(() => {
    if (!idsKey) return;
    let alive = true;
    getDailyCommentCounts(idsKey.split(","))
      .then((c) => alive && setCounts(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [idsKey]);
  const openFor = useSearchParams().get("comments");
  const days: { date: string; items: DailyUpdate[] }[] = [];
  for (const u of updates) {
    const last = days[days.length - 1];
    if (last?.date === u.work_date) last.items.push(u);
    else days.push({ date: u.work_date, items: [u] });
  }
  const label = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return (
    <div className="grid gap-6">
      {days.map((d) => (
        <section key={d.date} aria-label={label(d.date)}>
          <h2 className="sticky top-14 z-10 -mx-1 mb-2 bg-background/95 px-1 py-1.5 text-sm font-semibold text-muted-foreground backdrop-blur md:top-0">
            {label(d.date)} <span className="font-normal">· {d.items.length} {d.items.length === 1 ? "update" : "updates"}</span>
          </h2>
          <div className="grid gap-3">
            {d.items.map((u) => (
              <DiaryCard key={u.id} update={u} me={me} showProject={showProject} commentCount={counts[u.id] ?? 0} openComments={openFor === u.id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
