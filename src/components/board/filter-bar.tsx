"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EMPTY_FILTERS, filtersActive } from "@/lib/board";
import { fullName } from "@/lib/utils";
import { useBoard } from "./board-context";

export function FilterBar({ hideStatus = false }: { hideStatus?: boolean }) {
  const { board, filters, setFilters } = useBoard();
  const set = (patch: Partial<typeof filters>) => setFilters({ ...filters, ...patch });
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
      <div className="relative sm:col-span-2 lg:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={filters.text} onChange={(e) => set({ text: e.target.value })} placeholder="Search tasks" aria-label="Search tasks" className="pl-9" />
      </div>
      <div className="lg:w-48">
        <NativeSelect aria-label="Filter by person" value={filters.person} onChange={(e) => set({ person: e.target.value })}>
          <option value="all">Everyone</option>
          <option value="me">My tasks</option>
          <option value="none">No owner</option>
          {board.members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {fullName(m)}
            </option>
          ))}
        </NativeSelect>
      </div>
      {!hideStatus && (
        <div className="lg:w-44">
          <NativeSelect aria-label="Filter by status" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="all">Any status</option>
            <option value="open">Not done</option>
            {board.labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="lg:w-44">
        <NativeSelect aria-label="Filter by due date" value={filters.due} onChange={(e) => set({ due: e.target.value as typeof filters.due })}>
          <option value="all">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due in 7 days</option>
          <option value="none">No due date</option>
        </NativeSelect>
      </div>
      {filtersActive(filters) && (
        <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)} className="justify-self-start">
          <X aria-hidden /> Clear filters
        </Button>
      )}
    </div>
  );
}
