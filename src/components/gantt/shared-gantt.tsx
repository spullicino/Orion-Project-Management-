"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { GanttInput, Zoom } from "@/lib/gantt/layout";
import { GanttChart } from "./gantt-chart";

export function SharedGantt({ input, today, showOwners, legend }: { input: GanttInput; today: string; showOwners: boolean; legend: { label: string; color: string }[] }) {
  const [zoom, setZoom] = useState<Zoom>("week");
  const options = useMemo(() => ({ zoom, colorBy: "status" as const, today, showOwners }), [zoom, today, showOwners]);
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="Zoom" className="inline-flex w-fit rounded-lg border bg-card p-0.5">
        {(["day", "week", "month"] as const).map((z) => (
          <button
            key={z}
            type="button"
            role="radio"
            aria-checked={zoom === z}
            onClick={() => setZoom(z)}
            className={cn("h-10 rounded-md px-4 text-sm font-medium", zoom === z ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {z === "day" ? "Days" : z === "week" ? "Weeks" : "Months"}
          </button>
        ))}
      </div>
      <GanttChart input={input} options={options} />
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-2">
            <span className="h-3 w-5 rounded" style={{ background: l.color }} aria-hidden />
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="size-2.5 rotate-45 bg-violet-600" aria-hidden /> Milestone
        </li>
        <li className="flex items-center gap-2">
          <span className="h-4 w-0.5 bg-red-600" aria-hidden /> Today
        </li>
      </ul>
    </div>
  );
}
