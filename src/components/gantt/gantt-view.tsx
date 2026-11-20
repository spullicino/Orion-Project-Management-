"use client";

import { CalendarCheck, Diamond, FileDown, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { saveMilestone } from "@/app/(app)/projects/gantt-actions";
import { useBoard } from "@/components/board/board-context";
import { FilterBar } from "@/components/board/filter-bar";
import { Button } from "@/components/ui/button";
import { filterTasks, todayISO } from "@/lib/board";
import type { ColorBy, GanttInput, Zoom } from "@/lib/gantt/layout";
import { cn, fullName } from "@/lib/utils";
import type { Milestone } from "@/types/board";
import { ExportDialog, MilestoneDialog, ShareDialog } from "./gantt-dialogs";
import { GanttChart } from "./gantt-chart";

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-10 rounded-md px-3 text-sm font-medium", value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GanttView() {
  const { board, tasks, filters, perms, patchTask, openTask, membersById } = useBoard();
  const [zoom, setZoom] = useState<Zoom>("week");
  const [colorBy, setColorBy] = useState<ColorBy>("status");
  const [todayKey, setTodayKey] = useState(0);
  const [milestone, setMilestone] = useState<{ open: boolean; value: Milestone | null }>({ open: false, value: null });
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const visible = useMemo(() => filterTasks(tasks, filters, perms.meId), [tasks, filters, perms.meId]);
  const input: GanttInput = useMemo(
    () => ({
      tasks: visible.map((t) => ({
        ...t,
        owners: t.assignees.map((id) => fullName(membersById.get(id) ?? {})),
      })),
      groups: board.groups,
      milestones: board.milestones,
      labels: board.labels,
      projectStart: board.project.start_date,
      projectEnd: board.project.end_date,
    }),
    [visible, board, membersById],
  );
  const options = useMemo(() => ({ zoom, colorBy, today: todayISO(), showOwners: false }), [zoom, colorBy]);
  const undated = visible.filter((t) => !t.start_date && !t.due_date).length;

  return (
    <>
      <FilterBar />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Zoom" value={zoom} onChange={setZoom} options={[{ value: "day", label: "Days" }, { value: "week", label: "Weeks" }, { value: "month", label: "Months" }]} />
        <Segmented label="Colour bars by" value={colorBy} onChange={setColorBy} options={[{ value: "status", label: "By status" }, { value: "group", label: "By group" }]} />
        <Button variant="outline" onClick={() => setTodayKey((k) => k + 1)}>
          <CalendarCheck aria-hidden /> Today
        </Button>
        {perms.canManage && (
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <Button variant="outline" onClick={() => setMilestone({ open: true, value: null })}>
              <Diamond aria-hidden /> Milestone
            </Button>
            <Button variant="outline" onClick={() => setExportOpen(true)}>
              <FileDown aria-hidden /> Export
            </Button>
            <Button onClick={() => setShareOpen(true)}>
              <Share2 aria-hidden /> Share with client
            </Button>
          </div>
        )}
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        {perms.canManage ? (
          <>
            <span className="hidden md:inline">Drag a bar to move it, or drag its ends to change dates. </span>
            <span className="md:hidden">Tap a bar to change its dates. </span>
          </>
        ) : null}
        Tap a task to open it.{undated ? ` ${undated} ${undated === 1 ? "task has" : "tasks have"} no dates yet.` : ""}
      </p>

      <GanttChart
        input={input}
        options={options}
        canEdit={perms.canManage}
        scrollToTodayKey={todayKey}
        onOpenTask={(id) => openTask(id)}
        onChangeDates={(id, start, end) => void patchTask(id, { start_date: start, due_date: end })}
        onMilestoneClick={(id) => perms.canManage && setMilestone({ open: true, value: board.milestones.find((m) => m.id === id) ?? null })}
        onMoveMilestone={async (id, date) => {
          const m = board.milestones.find((x) => x.id === id);
          if (!m) return;
          const res = await saveMilestone(board.project.id, id, { title: m.title, date, color: m.color, description: m.description });
          if (!res.ok) toast.error(res.error);
        }}
      />

      <MilestoneDialog key={milestone.value?.id ?? "new"} projectId={board.project.id} milestone={milestone.value} open={milestone.open} onClose={() => setMilestone({ open: false, value: null })} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} project={board.project} input={input} defaultColorBy={colorBy} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} projectId={board.project.id} />
    </>
  );
}
