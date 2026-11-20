"use client";

import { CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AndroidInstallSteps, IosInstallSteps, useInstall } from "./app-helpers";

/** Profile → "Install the app", always available (the pop-up can be dismissed). */
export function InstallCard() {
  const { standalone, ios, canPrompt, install } = useInstall();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Install the app</CardTitle>
        <CardDescription>Put Orion Projects on your home screen like a normal app.</CardDescription>
      </CardHeader>
      <CardContent>
        {standalone ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="size-5" aria-hidden /> You&apos;re using the installed app.
          </p>
        ) : canPrompt ? (
          <Button onClick={() => void install()}>
            <Download aria-hidden /> Install
          </Button>
        ) : ios ? (
          <IosInstallSteps />
        ) : (
          <div className="grid gap-3">
            <AndroidInstallSteps />
            <p className="text-xs text-muted-foreground">On a computer, use the install icon in the address bar (Chrome or Edge).</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
