"use client";

import { BellRing, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePushDevice } from "@/components/notifications/use-push-device";
import { Button } from "@/components/ui/button";

const KEY = "orion:chat-notify-dismissed";

/** Top of Chats: "turn on notifications so you don't miss messages", until this device has them on. */
export function ChatNotifyBanner() {
  const { push, busy, enable } = usePushDevice();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this device's storage
      setDismissed(localStorage.getItem(KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || dismissed) return null;
  if (push !== "off" && push !== "ios-install" && push !== "denied") return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: just hide for now */
    }
  };

  return (
    <div className="relative mb-3 grid gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 pr-11">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <BellRing className="size-4 shrink-0 text-primary" aria-hidden /> Don&apos;t miss messages
      </p>
      {push === "off" && (
        <>
          <p className="text-sm text-muted-foreground">Get a notification on this phone for every new message, like WhatsApp.</p>
          <Button size="sm" onClick={enable} disabled={busy} className="justify-self-start">
            {busy && <Loader2 className="animate-spin" aria-hidden />} Turn on notifications
          </Button>
        </>
      )}
      {push === "ios-install" && (
        <p className="text-sm text-muted-foreground">
          On iPhone, first add the app to your Home Screen: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, open it from the new icon, and come back here.
        </p>
      )}
      {push === "denied" && (
        <p className="text-sm text-muted-foreground">Notifications are blocked for this app. Allow them in your phone&apos;s settings (Settings → Notifications), then reopen the app.</p>
      )}
      <button type="button" onClick={dismiss} aria-label="Hide this message" className="absolute right-0 top-0 flex size-11 items-center justify-center text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}
