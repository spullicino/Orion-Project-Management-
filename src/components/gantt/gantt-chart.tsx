"use client";

import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyDrag, daysBetween, dragDays, layoutGantt, type GanttInput, type GanttOptions, type TaskRow } from "@/lib/gantt/layout";
import { GanttLabels, GanttTimeline, type BarOverride } from "./gantt-svg";

type Drag =
  | { kind: "bar"; row: TaskRow; mode: "move" | "start" | "end"; startX: number; delta: number; moved: boolean }
  | { kind: "milestone"; id: string; date: string; startX: number; delta: number; moved: boolean };

export type GanttChartProps = {
  input: GanttInput;
  options: GanttOptions;
  /** Managers can drag bars and milestones (mouse/pen; on phones they tap instead). */
  canEdit?: boolean;
  onOpenTask?: (taskId: string) => void;
  onChangeDates?: (taskId: string, start: string, end: string) => void;
  onMilestoneClick?: (id: string) => void;
  onMoveMilestone?: (id: string, date: string) => void;
  /** Changes whenever the caller wants the view scrolled to today. */
  scrollToTodayKey?: number;
};

export function GanttChart({ input, options, canEdit, onOpenTask, onChangeDates, onMilestoneClick, onMoveMilestone, scrollToTodayKey }: GanttChartProps) {
  const layout = useMemo(() => layoutGantt(input, options), [input, options]);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const [labelW, setLabelW] = useState(260);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setLabelW(mq.matches ? 150 : 260);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Start with today (or the project start) in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = layout.todayX ?? 0;
    el.scrollTo({ left: Math.max(0, target - el.clientWidth / 3), behavior: scrollToTodayKey ? "smooth" : "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on zoom change / explicit "Today"
  }, [options.zoom, scrollToTodayKey]);

  // Pointer tracking while dragging.
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - drag.startX;
      const delta = dragDays(dx, layout.dayWidth);
      if (delta !== drag.delta || (!drag.moved && Math.abs(dx) > 4)) setDrag({ ...drag, delta, moved: drag.moved || Math.abs(dx) > 4 });
    };
    const up = () => {
      const d = drag;
      setDrag(null);
      if (d.kind === "bar") {
        if (!d.moved) return onOpenTask?.(d.row.task.id);
        if (d.delta !== 0 && d.row.bar) {
          const next = applyDrag(d.row.bar, d.mode, d.delta);
          onChangeDates?.(d.row.task.id, next.start, next.end);
        }
      } else {
        if (!d.moved) return onMilestoneClick?.(d.id);
        if (d.delta !== 0) onMoveMilestone?.(d.id, applyDrag({ start: d.date, end: d.date }, "move", d.delta).start);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", () => setDrag(null), { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, layout.dayWidth, onOpenTask, onChangeDates, onMilestoneClick, onMoveMilestone]);

  let override: BarOverride = null;
  if (drag?.kind === "bar" && drag.row.bar && drag.delta !== 0) {
    const bar = drag.row.bar;
    const next = applyDrag(bar, drag.mode, drag.delta);
    override = {
      taskId: drag.row.task.id,
      x: bar.x + daysBetween(bar.start, next.start) * layout.dayWidth,
      width: (daysBetween(next.start, next.end) + 1) * layout.dayWidth,
    };
  }
  const milestoneOverride =
    drag?.kind === "milestone" ? { id: drag.id, x: (layout.milestones.find((m) => m.id === drag.id)?.x ?? 0) + drag.delta * layout.dayWidth } : null;

  const isMouse = (e: React.PointerEvent) => e.pointerType === "mouse" || e.pointerType === "pen";

  return (
    <div data-no-pull className="flex overflow-hidden rounded-xl border bg-card" style={{ userSelect: drag ? "none" : undefined }}>
      <svg width={labelW} height={layout.height} className="shrink-0 border-r" role="presentation">
        <GanttLabels layout={layout} width={labelW} showOwners={options.showOwners} onRowClick={onOpenTask} dark={dark} />
      </svg>
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" tabIndex={0} aria-label="Timeline (scroll sideways with the arrow keys)">
        <svg width={layout.width} height={layout.height} role="img" aria-label="Gantt chart of the project's tasks">
          <GanttTimeline
            layout={layout}
            override={override}
            dark={dark}
            handlers={{
              onRowClick: onOpenTask,
              milestoneOverride,
              onBarPointerDown: (e, row, mode) => {
                // Phones: tap to open the task (edit dates there) — dragging would fight with scrolling.
                if (!canEdit || !isMouse(e)) {
                  if (mode === "move") onOpenTask?.(row.task.id);
                  return;
                }
                e.preventDefault();
                setDrag({ kind: "bar", row, mode, startX: e.clientX, delta: 0, moved: false });
              },
              onMilestonePointerDown: (e, id) => {
                const m = input.milestones.find((x) => x.id === id);
                if (!m) return;
                if (!canEdit || !isMouse(e)) return onMilestoneClick?.(id);
                e.preventDefault();
                setDrag({ kind: "milestone", id, date: m.date, startX: e.clientX, delta: 0, moved: false });
              },
            }}
          />
        </svg>
      </div>
    </div>
  );
}
