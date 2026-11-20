"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { loadFeed } from "@/app/(app)/daily-update/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { fullName } from "@/lib/utils";
import type { DailyUpdate, FeedQuery } from "@/types/diary";
import { DiaryDays } from "./diary-card";

const PAGE = 20;

/** Paginated, filterable feed of daily updates (project diary, team view). */
export function DiaryFeed({
  initial,
  baseQuery,
  me,
  people = [],
  projects,
  showProject,
  emptyText = "No daily updates yet.",
}: {
  initial: DailyUpdate[];
  baseQuery: FeedQuery;
  me: { id: string; isManager: boolean };
  people?: { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[];
  projects?: { id: string; name: string }[];
  showProject?: boolean;
  emptyText?: string;
}) {
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE);
  const [filters, setFilters] = useState({ author: "", from: "", to: "", project: "" });
  const [pending, start] = useTransition();
  const filtered = Boolean(filters.author || filters.from || filters.to || filters.project);

  // New data from the server (after posting, editing or a live update) replaces the first page.
  useEffect(() => {
    if (filtered) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync server props into local state
    setItems(initial);
    setHasMore(initial.length >= PAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the server data changes
  }, [initial]);

  const query = (f = filters): FeedQuery => ({
    ...baseQuery,
    author: f.author || baseQuery.author || null,
    from: f.from || baseQuery.from || null,
    to: f.to || baseQuery.to || null,
    project: f.project || baseQuery.project || null,
    limit: PAGE,
  });

  const apply = (f: typeof filters) => {
    setFilters(f);
    start(async () => {
      const res = await loadFeed(query(f));
      if (!res.ok) return void toast.error(res.error);
      setItems(res.data ?? []);
      setHasMore((res.data?.length ?? 0) >= PAGE);
    });
  };

  const more = () => {
    const last = items[items.length - 1];
    if (!last) return;
    start(async () => {
      const res = await loadFeed({ ...query(), before: { date: last.work_date, created: last.created_at } });
      if (!res.ok) return void toast.error(res.error);
      setItems((xs) => [...xs, ...(res.data ?? [])]);
      setHasMore((res.data?.length ?? 0) >= PAGE);
    });
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        {projects && projects.length > 1 && (
          <div className="lg:w-56">
            <NativeSelect aria-label="Filter by project" value={filters.project} onChange={(e) => apply({ ...filters, project: e.target.value })}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {people.length > 0 && (
          <div className="lg:w-52">
            <NativeSelect aria-label="Filter by person" value={filters.author} onChange={(e) => apply({ ...filters, author: e.target.value })}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {fullName(p)}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <label className="grid gap-1 text-xs text-muted-foreground lg:w-44">
          From
          <Input type="date" value={filters.from} onChange={(e) => apply({ ...filters, from: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground lg:w-44">
          To
          <Input type="date" value={filters.to} onChange={(e) => apply({ ...filters, to: e.target.value })} />
        </label>
        {filtered && (
          <Button variant="ghost" onClick={() => apply({ author: "", from: "", to: "", project: "" })} className="justify-self-start">
            <X aria-hidden /> Clear
          </Button>
        )}
      </div>

      {pending && items.length === 0 ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{filtered ? "No updates match these filters." : emptyText}</p>
      ) : (
        <DiaryDays updates={items} me={me} showProject={showProject} />
      )}

      {hasMore && items.length > 0 && (
        <Button variant="outline" onClick={more} disabled={pending} className="justify-self-center">
          {pending && <Loader2 className="animate-spin" aria-hidden />} Show older updates
        </Button>
      )}
    </div>
  );
}
