"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { quarterHours } from "@/lib/time-options";

export type RepeatWindow = { from: string; to: string; weekdaysOnly: boolean; days: number };

export const DEFAULT_REPEAT: RepeatWindow = { from: "07:00", to: "17:00", weekdaysOnly: false, days: 3 };
const TIMES = quarterHours(5, 24);
const DAYS = [1, 2, 3, 5, 7, 14];

/** "07:00–17:00 · weekdays · for 3 days" */
export function describeRepeat(w: RepeatWindow) {
  return `${w.from}–${w.to}${w.weekdaysOnly ? " · weekdays only" : " · every day"} · for ${w.days} ${w.days === 1 ? "day" : "days"}`;
}

/** Start / end time, weekdays only, and for how many days — when unread important messages are sent again. */
export function RepeatWindowFields({ value, onChange, disabled }: { value: RepeatWindow; onChange: (v: RepeatWindow) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="grid min-w-0 gap-1 text-sm font-medium">
          From
          <NativeSelect value={value.from} disabled={disabled} onChange={(e) => onChange({ ...value, from: e.target.value })}>
            {TIMES.filter((t) => t < value.to).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium">
          Until
          <NativeSelect value={value.to} disabled={disabled} onChange={(e) => onChange({ ...value, to: e.target.value })}>
            {TIMES.filter((t) => t > value.from).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
        <label className="grid min-w-0 gap-1 text-sm font-medium">
          Keep sending for
          <NativeSelect value={String(value.days)} disabled={disabled} onChange={(e) => onChange({ ...value, days: Number(e.target.value) })}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? "day" : "days"}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-sm font-medium">
          Weekdays only (not Sat/Sun)
          <Switch checked={value.weekdaysOnly} disabled={disabled} onCheckedChange={(v) => onChange({ ...value, weekdaysOnly: v })} />
        </label>
      </div>
    </div>
  );
}
