"use client";

import { useState } from "react";
import { updateSettings } from "@/app/(app)/admin/actions";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/types/database";
import { DEFAULT_REPEAT, RepeatWindowFields, type RepeatWindow } from "./repeat-window-fields";
import { useAction } from "./use-action";

// Quarter hours from 06:00 to 20:45 — the reminder job checks every 15 minutes.
const TIMES = Array.from({ length: (21 - 6) * 4 }, (_, i) => {
  const m = 6 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const label12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${t} (${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"})`;
};

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [basicCanPost, setBasicCanPost] = useState(settings.basic_can_post_chat);
  const hasReminder = settings.daily_reminder_enabled !== undefined; // database update 0023
  const [reminderOn, setReminderOn] = useState(settings.daily_reminder_enabled ?? true);
  const [time, setTime] = useState((settings.daily_reminder_time ?? "16:30").slice(0, 5));
  const hasWindow = settings.message_repeat_from !== undefined; // database update 0027
  const [win, setWin] = useState<RepeatWindow>(
    hasWindow
      ? {
          from: settings.message_repeat_from!.slice(0, 5),
          to: settings.message_repeat_to!.slice(0, 5),
          weekdaysOnly: !!settings.message_repeat_weekdays_only,
          days: settings.message_repeat_days ?? 3,
        }
      : DEFAULT_REPEAT,
  );
  const { pending, run } = useAction();
  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="basic-chat" className="text-base">
            Basic users can post in project chats
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">When off, Basic users can read project chats but not write in them.</p>
        </div>
        <Switch
          id="basic-chat"
          checked={basicCanPost}
          disabled={pending}
          onCheckedChange={(v) => {
            setBasicCanPost(v);
            run(() => updateSettings({ basicCanPostChat: v }));
          }}
        />
      </div>

      <div className="grid gap-3 border-t pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="daily-reminder" className="text-base">
              Daily update reminder
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              On working days, technicians on active projects who haven&apos;t posted today&apos;s daily update get a phone notification at this time (Malta time).
            </p>
          </div>
          <Switch
            id="daily-reminder"
            checked={reminderOn}
            disabled={pending || !hasReminder}
            onCheckedChange={(v) => {
              setReminderOn(v);
              run(() => updateSettings({ reminderEnabled: v }));
            }}
          />
        </div>
        {hasReminder ? (
          <label className="grid max-w-xs gap-1 text-sm font-medium">
            Reminder time
            <NativeSelect
              value={time}
              disabled={pending || !reminderOn}
              onChange={(e) => {
                setTime(e.target.value);
                run(() => updateSettings({ reminderTime: e.target.value }));
              }}
            >
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {label12(t)}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Run database update 0023 (daily reminder) to turn this on.</p>
        )}
      </div>

      <div className="grid gap-3 border-t pt-5">
        <div>
          <p className="text-base font-medium">Important messages: when to send again</p>
          <p className="mt-1 text-sm text-muted-foreground">
            If someone hasn&apos;t read an important message, it&apos;s sent again only between these times (Malta time). The first notification always goes out straight away. You can change this for a single message when you send it.
          </p>
        </div>
        {hasWindow ? (
          <RepeatWindowFields
            value={win}
            disabled={pending}
            onChange={(v) => {
              setWin(v);
              run(() => updateSettings({ messageRepeat: v }));
            }}
          />
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Run database update 0027 to change this.</p>
        )}
      </div>
    </div>
  );
}
