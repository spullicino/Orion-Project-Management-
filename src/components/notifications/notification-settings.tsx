"use client";

import { BellRing, Loader2, Send, Smartphone } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePrefs, sendTestNotification, type NotificationPrefs } from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePushDevice } from "./use-push-device";

const TYPES: { key: string; label: string }[] = [
  { key: "task.assigned", label: "Someone gives me a task" },
  { key: "chat.message", label: "New chat messages (chats you can read; mute a chat to silence it)" },
  { key: "mention", label: "Someone @mentions me in a chat" },
  { key: "task.comment", label: "Comments on my tasks" },
  { key: "task.status", label: "Status changes on my tasks" },
  { key: "task.due_soon", label: "My tasks are due today or tomorrow" },
  { key: "task.overdue", label: "My tasks are overdue" },
  { key: "daily.new", label: "New daily updates on my projects (managers)" },
  { key: "personal.due", label: "My personal to-dos are due" },
  { key: "material.new", label: "New material requests on my projects (managers)" },
  { key: "material.status", label: "Updates on material requests (ordered, delivered…)" },
  { key: "material.comment", label: "Comments on material requests" },
];

export function NotificationSettings({ initial, pushAvailable }: { initial: NotificationPrefs; pushAvailable: boolean }) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, start] = useTransition();
  const save = (next: NotificationPrefs) => {
    setPrefs(next);
    start(async () => {
      const res = await savePrefs(next);
      if (!res.ok) toast.error(res.error);
    });
  };

  const { push, busy, enable: enablePush, disable: disablePush } = usePushDevice({
    onEnabled: () => !prefs.push_enabled && save({ ...prefs, push_enabled: true }),
  });

  return (
    <Card id="notifications" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose what you hear about. You always see everything in the bell 🔔.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {/* This device */}
        <div className="grid gap-3 rounded-xl border p-4">
          <p className="flex items-center gap-2 font-medium">
            <Smartphone className="size-5 text-primary" aria-hidden /> Notifications on this device
          </p>
          {!pushAvailable ? (
            <p className="text-sm text-muted-foreground">Phone notifications aren&apos;t set up for this app yet (ask your administrator — README, step “Push notifications”).</p>
          ) : push === "checking" ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : push === "ios-install" ? (
            <p className="text-sm text-muted-foreground">
              On iPhone, first add Orion Projects to your Home Screen: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, open it from there, then come back here.
            </p>
          ) : push === "unsupported" ? (
            <p className="text-sm text-muted-foreground">This browser can&apos;t show notifications. Try Chrome, Edge, Safari (iOS 16.4+, installed app) or Firefox.</p>
          ) : push === "denied" ? (
            <p className="text-sm text-muted-foreground">Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.</p>
          ) : push === "on" ? (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-success">
                <BellRing className="size-4" aria-hidden /> On
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  const res = await sendTestNotification();
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(res.data?.pushed ? "Test sent — it should appear in a moment." : "Test added to your bell. The push couldn't be delivered to this device.");
                }}
              >
                <Send aria-hidden /> Send a test
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={disablePush}>
                Turn off on this device
              </Button>
            </div>
          ) : (
            <Button onClick={enablePush} disabled={busy} className="justify-self-start">
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <BellRing aria-hidden />} Turn on notifications
            </Button>
          )}
        </div>

        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Phone notifications</span>
            <span className="block text-sm text-muted-foreground">Master switch for all your devices.</span>
          </span>
          <Switch checked={prefs.push_enabled} onCheckedChange={(v) => save({ ...prefs, push_enabled: v })} disabled={pending} />
        </label>

        <fieldset className="grid gap-1">
          <legend className="mb-2 font-medium">Tell me when…</legend>
          {TYPES.map((t) => (
            <label key={t.key} className="flex min-h-11 items-center justify-between gap-4 rounded-lg px-1 hover:bg-accent/50">
              <span className="text-sm">{t.label}</span>
              <Switch checked={prefs.types[t.key] !== false} onCheckedChange={(v) => save({ ...prefs, types: { ...prefs.types, [t.key]: v } })} disabled={pending} />
            </label>
          ))}
        </fieldset>

        <div className="grid gap-2">
          <span className="font-medium">Quiet hours (no phone notifications)</span>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            From
            <Input type="time" className="w-32" value={prefs.quiet_hours_from ?? ""} onChange={(e) => save({ ...prefs, quiet_hours_from: e.target.value || null })} aria-label="Quiet hours start" />
            to
            <Input type="time" className="w-32" value={prefs.quiet_hours_to ?? ""} onChange={(e) => save({ ...prefs, quiet_hours_to: e.target.value || null })} aria-label="Quiet hours end" />
          </div>
        </div>

        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Daily email summary</span>
            <span className="block text-sm text-muted-foreground">Every morning: your tasks due soon and what you missed.</span>
          </span>
          <Switch checked={prefs.email_digest} onCheckedChange={(v) => save({ ...prefs, email_digest: v })} disabled={pending} />
        </label>
      </CardContent>
    </Card>
  );
}
