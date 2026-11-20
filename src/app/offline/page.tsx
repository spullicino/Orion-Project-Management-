import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Offline" };
export const dynamic = "force-static";

/** Shown by the service worker when there's no signal and the page wasn't saved. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <CloudOff className="mt-4 size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="max-w-sm text-muted-foreground">
        This page hasn&apos;t been saved on this device yet. Pages you opened recently still work, and daily updates you post are kept on your phone and sent when
        you&apos;re back online.
      </p>
      <div className="grid w-full max-w-xs gap-2">
        <Button asChild size="lg">
          <a href="/daily-update">Post a daily update</a>
        </Button>
        <Button asChild variant="outline">
          <a href="/home">Go to Home</a>
        </Button>
      </div>
    </main>
  );
}
