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
  const box = useRef<HTMLDivElement>(null);
  const resize = useRef<{ startX: number; startW: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const [resizing, setResizing] = useState(false);

  // Task column width: the person's own choice on this device (phone and computer remembered separately).
  const phone = () => window.matchMedia("(max-width: 640px)").matches;
  const storeKey = () => (phone() ? "orion-gantt-names-phone" : "orion-gantt-names");
  const defaultW = () => (phone() ? 150 : 260);
  const limits = () => {
    const total = box.current?.clientWidth ?? 1000;
    return { min: 110, max: Math.max(160, Math.min(total - (phone() ? 90 : 200), 900)) };
  };
  const clampW = (w: number) => {
    const { min, max } = limits();
    return Math.round(Math.min(max, Math.max(min, w)));
  };
  const saveW = (w: number) => {
    try {
      localStorage.setItem(storeKey(), String(w));
    } catch {
      /* private mode: just for now */
    }
  };
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => {
      let saved: number | null = null;
      try {
        saved = Number(localStorage.getItem(storeKey())) || null;
      } catch {
        /* ignore */
      }
      setLabelW(clampW(saved ?? defaultW()));
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, and when switching between phone and computer width
  }, []);

  /** Just wide enough for the longest task or group name. */
  const fitWidth = () => {
    const longest = Math.max(12, ...input.tasks.map((t) => t.title.length), ...input.groups.map((g) => g.name.length));
    return clampW(longest * 7.2 + 28 + 46 + 8);
  };
  const autoFit = () => {
    const fit = fitWidth();
    const next = Math.abs(labelW - fit) < 4 ? clampW(defaultW()) : fit;
    setLabelW(next);
    saveW(next);
  };

  // Dragging the divider between the task names and the timeline.
  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent) => {
      const r = resize.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      if (Math.abs(dx) > 3) r.moved = true;
      setLabelW(clampW(r.startW + dx));
    };
    const up = () => {
      const r = resize.current;
      resize.current = null;
      setResizing(false);
      if (r && !r.moved) {
        // Double tap / double click: fit to the longest name (again: back to normal).
        const now = Date.now();
        if (now - lastTap.current < 350) {
          lastTap.current = 0;
          autoFit();
        } else lastTap.current = now;
      }
      setLabelW((w) => {
        saveW(w);
        return w;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tracks one drag at a time
  }, [resizing]);

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
    <div ref={box} data-no-pull className="relative flex overflow-hidden rounded-xl border bg-card" style={{ userSelect: drag || resizing ? "none" : undefined }}>
      <svg width={labelW} height={layout.height} className="shrink-0 border-r" role="presentation">
        <GanttLabels layout={layout} width={labelW} showOwners={options.showOwners} onRowClick={onOpenTask} dark={dark} />
      </svg>
      {/* Drag to widen or narrow the task names; double tap to fit the longest name. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Task name column width — drag, use the arrow keys, or double tap to fit the names"
        aria-valuenow={labelW}
        aria-valuemin={110}
        tabIndex={0}
        title="Drag to resize · double-click to fit the names"
        onPointerDown={(e) => {
          e.preventDefault();
          resize.current = { startX: e.clientX, startW: labelW, moved: false };
          setResizing(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Enter") return;
          e.preventDefault();
          if (e.key === "Enter") return autoFit();
          const next = clampW(labelW + (e.key === "ArrowRight" ? 24 : -24));
          setLabelW(next);
          saveW(next);
        }}
        className="group absolute inset-y-0 z-10 flex w-6 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none"
        style={{ left: labelW }}
      >
        <span className={`h-full w-0.5 transition-colors ${resizing ? "bg-primary" : "bg-transparent group-hover:bg-primary/50 group-focus-visible:bg-primary"}`} />
        <span
          className={`absolute top-[14px] flex h-7 w-4 items-center justify-center rounded-md border bg-card text-muted-foreground shadow-sm ${resizing ? "border-primary text-primary" : ""}`}
          aria-hidden
        >
          <svg width="6" height="12" viewBox="0 0 6 12" fill="currentColor">
            <circle cx="1.5" cy="2" r="1.2" />
            <circle cx="4.5" cy="2" r="1.2" />
            <circle cx="1.5" cy="6" r="1.2" />
            <circle cx="4.5" cy="6" r="1.2" />
            <circle cx="1.5" cy="10" r="1.2" />
            <circle cx="4.5" cy="10" r="1.2" />
          </svg>
        </span>
      </div>
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
