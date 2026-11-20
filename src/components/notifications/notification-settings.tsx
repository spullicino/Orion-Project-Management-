"use client";

import { BellRing, Loader2, Send, Smartphone } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { removePushSubscription, savePrefs, savePushSubscription, sendTestNotification, type NotificationPrefs } from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const TYPES: { key: string; label: string }[] = [
  { key: "task.assigned", label: "Someone gives me a task" },
  { key: "mention", label: "Someone @mentions me in a chat" },
  { key: "task.comment", label: "Comments on my tasks" },
  { key: "task.status", label: "Status changes on my tasks" },
  { key: "task.due_soon", label: "My tasks are due today or tomorrow" },
  { key: "task.overdue", label: "My tasks are overdue" },
  { key: "daily.new", label: "New daily updates on my projects (managers)" },
  { key: "personal.due", label: "My personal to-dos are due" },
];

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on" | "checking";

async function getRegistration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
}

export function NotificationSettings({ initial, pushAvailable }: { initial: NotificationPrefs; pushAvailable: boolean }) {
  const [prefs, setPrefs] = useState(initial);
  const [push, setPush] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setPush(ios && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setPush("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    })().catch(() => setPush("unsupported"));
  }, []);

  const save = (next: NotificationPrefs) => {
    setPrefs(next);
    start(async () => {
      const res = await savePrefs(next);
      if (!res.ok) toast.error(res.error);
    });
  };

  async function enablePush() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "denied" : "off");
        return void toast.error("Notifications were not allowed.");
      }
      const reg = await getRegistration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
      const res = await savePushSubscription(sub.toJSON(), navigator.userAgent);
      if (!res.ok) throw new Error(res.error);
      setPush("on");
      if (!prefs.push_enabled) save({ ...prefs, push_enabled: true });
      toast.success("Notifications are on for this device");
    } catch (e) {
      toast.error((e as Error).message || "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setPush("off");
      toast.success("Notifications are off for this device");
    } finally {
      setBusy(false);
    }
  }

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
