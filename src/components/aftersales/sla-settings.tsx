"use client";

import { Clock, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addHoliday, removeHoliday, saveSlaSettings } from "@/app/(app)/aftersales/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { TARGET_PRIORITIES } from "@/lib/aftersales";
import { cn, formatDate } from "@/lib/utils";
import type { TicketPriority } from "@/types/database";

export type SlaSettings = {
  work_start: string;
  work_end: string;
  work_days: number[];
  targets: Record<TicketPriority, { first: number; resolve: number }>;
  auto_close_days: number;
};
type Unit = "h" | "d";
type Amount = { n: string; unit: Unit };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Minutes → "9 h" or "2 working days" (whole days when it divides evenly). */
const toAmount = (min: number, day: number): Amount => (min >= day && min % day === 0 ? { n: String(min / day), unit: "d" } : { n: String(Math.round((min / 60) * 100) / 100), unit: "h" });
const toMinutes = (a: Amount, day: number) => Math.round(Number(a.n) * (a.unit === "d" ? day : 60));

function AmountInput({ value, onChange, disabled, label }: { value: Amount; onChange: (a: Amount) => void; disabled: boolean; label: string }) {
  return (
    <div className="flex min-w-0 gap-1">
      <Input type="number" inputMode="decimal" min={0.25} step={0.25} value={value.n} onChange={(e) => onChange({ ...value, n: e.target.value })} disabled={disabled} aria-label={label} className="w-20 min-w-0" />
      <NativeSelect value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value as Unit })} disabled={disabled} aria-label={`${label} unit`} className="min-w-0 flex-1">
        <option value="h">hours</option>
        <option value="d">working days</option>
      </NativeSelect>
    </div>
  );
}

export function SlaSettingsCard({ settings, holidays, isManager, today }: { settings: SlaSettings | null; holidays: { day: string; name: string }[]; isManager: boolean; today: string }) {
  const router = useRouter();
  const s = settings;
  const dayLen0 = s ? minutesOf(s.work_end) - minutesOf(s.work_start) : 540;
  const [start, setStart] = useState(s?.work_start.slice(0, 5) ?? "08:00");
  const [end, setEnd] = useState(s?.work_end.slice(0, 5) ?? "17:00");
  const [days, setDays] = useState<number[]>(s?.work_days ?? [1, 2, 3, 4, 5]);
  const [amounts, setAmounts] = useState(() =>
    Object.fromEntries(TARGET_PRIORITIES.map((p) => [p.value, { first: toAmount(s?.targets[p.value].first ?? 480, dayLen0), resolve: toAmount(s?.targets[p.value].resolve ?? 2700, dayLen0) }])) as Record<
      TicketPriority,
      { first: Amount; resolve: Amount }
    >,
  );
  const [autoClose, setAutoClose] = useState(String(s?.auto_close_days ?? 7));
  const [busy, setBusy] = useState<string | null>(null);
  const [hDay, setHDay] = useState("");
  const [hName, setHName] = useState("");
  const [showPast, setShowPast] = useState(false);

  if (!s) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5 text-primary" aria-hidden /> Response targets
          </CardTitle>
          <CardDescription>Run database update 0036 first.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const dayLen = minutesOf(end) - minutesOf(start);
  const shown = holidays.filter((h) => showPast || h.day >= today);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5 text-primary" aria-hidden /> Response targets
        </CardTitle>
        <CardDescription>
          How quickly tickets should get a first reply and be fixed, counted in working time (Malta). The clock stops while a ticket waits for the customer. The person on the ticket is told at 75% of the time, and they and the Aftersales managers when it&apos;s missed.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Working hours</legend>
          <div className="grid grid-cols-2 gap-2 sm:w-80">
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              From
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={!isManager} />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              Until
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!isManager} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
            {DAYS.map((d, i) => {
              const on = days.includes(i + 1);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  disabled={!isManager}
                  onClick={() => setDays(on ? days.filter((x) => x !== i + 1) : [...days, i + 1])}
                  className={cn("h-11 min-w-12 rounded-full border px-3 text-sm font-medium disabled:opacity-60", on ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">A working day = {Math.max(0, dayLen / 60)} hours.</p>
        </fieldset>

        <div className="grid gap-2">
          <div className="hidden grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Priority</span>
            <span>First reply within</span>
            <span>Fixed within</span>
          </div>
          {TARGET_PRIORITIES.map((p) => (
            <div key={p.value} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:rounded-none sm:border-0 sm:p-0">
              <span className="text-sm font-semibold">{p.label}</span>
              <label className="grid gap-1 text-xs text-muted-foreground sm:block">
                <span className="sm:sr-only">First reply within</span>
                <AmountInput label={`${p.label}: first reply`} value={amounts[p.value].first} disabled={!isManager} onChange={(a) => setAmounts({ ...amounts, [p.value]: { ...amounts[p.value], first: a } })} />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground sm:block">
                <span className="sm:sr-only">Fixed within</span>
                <AmountInput label={`${p.label}: fixed within`} value={amounts[p.value].resolve} disabled={!isManager} onChange={(a) => setAmounts({ ...amounts, [p.value]: { ...amounts[p.value], resolve: a } })} />
              </label>
            </div>
          ))}
        </div>

        <label className="grid gap-1 text-sm font-medium sm:w-80">
          Close resolved tickets after
          <NativeSelect value={autoClose} onChange={(e) => setAutoClose(e.target.value)} disabled={!isManager}>
            {[3, 5, 7, 14, 30].map((n) => (
              <option key={n} value={n}>
                {n} days with no reply from the customer
              </option>
            ))}
            <option value="0">Never — close them by hand</option>
          </NativeSelect>
        </label>

        {isManager && (
          <div className="grid gap-1">
            <Button
              className="justify-self-start"
              disabled={busy === "save"}
              onClick={async () => {
                setBusy("save");
                const targets = Object.fromEntries(TARGET_PRIORITIES.map((p) => [p.value, { first: toMinutes(amounts[p.value].first, dayLen), resolve: toMinutes(amounts[p.value].resolve, dayLen) }]));
                const res = await saveSlaSettings({ workStart: start, workEnd: end, workDays: days, targets, autoCloseDays: Number(autoClose) });
                setBusy(null);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Saved");
                router.refresh();
              }}
            >
              {busy === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save targets
            </Button>
            <p className="text-xs text-muted-foreground">New targets apply to new tickets, and to a ticket when its priority changes.</p>
          </div>
        )}

        <div className="grid gap-2 border-t pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Public holidays (not counted)</h3>
            <Button size="sm" variant="ghost" onClick={() => setShowPast(!showPast)}>
              {showPast ? "Hide past" : "Show past"}
            </Button>
          </div>
          <ul className="grid divide-y rounded-xl border">
            {shown.map((h) => (
              <li key={h.day} className="flex min-h-11 items-center gap-2 px-3 py-1 text-sm">
                <span className="w-28 shrink-0 font-medium">{formatDate(h.day)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.name}</span>
                {isManager && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${h.name}`}
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy(h.day);
                      const res = await removeHoliday(h.day);
                      setBusy(null);
                      if (!res.ok) return void toast.error(res.error);
                      router.refresh();
                    }}
                  >
                    {busy === h.day ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                  </Button>
                )}
              </li>
            ))}
            {!shown.length && <li className="p-3 text-sm text-muted-foreground">No upcoming holidays — add next year&apos;s.</li>}
          </ul>
          {isManager && (
            <form
              className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy("add");
                const res = await addHoliday(hDay, hName);
                setBusy(null);
                if (!res.ok) return void toast.error(res.error);
                setHDay("");
                setHName("");
                router.refresh();
              }}
            >
              <Input type="date" value={hDay} onChange={(e) => setHDay(e.target.value)} aria-label="Holiday date" />
              <Input value={hName} onChange={(e) => setHName(e.target.value)} maxLength={80} placeholder="e.g. Santa Marija" aria-label="Holiday name" />
              <Button type="submit" variant="outline" disabled={busy === "add" || !hDay || !hName.trim()}>
                {busy === "add" ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Add
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
