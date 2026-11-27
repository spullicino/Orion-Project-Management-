"use client";

import { Loader2, Mail, MailCheck } from "lucide-react";
import { useState } from "react";
import { requestPortalLink } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function PortalLogin({ error }: { error?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(error ?? null);
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="grid gap-4 p-6">
        <div className="grid gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Your aftersales requests</h1>
          <p className="text-sm text-muted-foreground">See the progress of your requests with Orion Group, reply, and send photos. Enter the email address you use with us and we&apos;ll email you a sign-in link — no password needed.</p>
        </div>
        {sent ? (
          <p role="status" className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> {sent}
          </p>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setProblem(null);
              const res = await requestPortalLink(email);
              setBusy(false);
              if (!res.ok) return setProblem(res.error);
              setSent(res.data!.message);
            }}
          >
            <label className="grid gap-1 text-sm font-medium">
              Email address
              <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} placeholder="you@company.com" />
            </label>
            {problem && <p className="text-sm text-destructive">{problem}</p>}
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />} Email me a sign-in link
            </Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          New problem? You can also email <a className="font-medium text-primary hover:underline" href="mailto:support@oriongroup.com.mt">support@oriongroup.com.mt</a>.
        </p>
      </CardContent>
    </Card>
  );
}
