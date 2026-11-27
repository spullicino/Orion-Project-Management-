"use client";

import { CircleAlert, CircleCheck, Copy, Loader2, Mail, RefreshCw, Save, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { checkMailNow, disconnectGmail, saveMailOptions } from "@/app/(app)/aftersales/mail-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type MailStatus = {
  mailbox: string | null;
  connected: boolean;
  connected_at: string | null;
  connected_by: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  auto_ack: boolean;
  ack_text: string;
  signature: string;
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));

export function mailScheduleSql(siteUrl: string) {
  return `-- Orion Projects: read new emails in support@ every minute (Aftersales).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'orion-aftersales-mail',
  '* * * * *',
  $job$
  select net.http_get(
    url := '${siteUrl}/api/cron/aftersales-mail',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select token from public.job_secrets where name = 'reminders')),
    timeout_milliseconds := 55000
  );
  $job$
);`;
}

const RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail is connected. New emails to support@ will now open tickets." },
  cancelled: { ok: false, text: "Connecting was cancelled in Google." },
  denied: { ok: false, text: "Only Aftersales managers can connect Gmail." },
  "not-configured": { ok: false, text: "Google isn't set up yet — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first." },
  "no-refresh": { ok: false, text: "Google didn't give lasting access. Remove “Orion Projects” in the Google account's security settings (Third-party access), then connect again." },
  failed: { ok: false, text: "Connecting didn't work. Try again — and make sure you sign in as the support@ mailbox." },
};

export function MailSettings({
  status,
  configured,
  isManager,
  isAdmin,
  siteUrl,
  redirectUri,
  result,
  nowMs,
  clientId,
  keysSwapped,
}: {
  status: MailStatus | null;
  configured: boolean;
  isManager: boolean;
  isAdmin: boolean;
  siteUrl: string;
  redirectUri: string;
  result?: string;
  nowMs: number;
  /** The Google Client ID the app uses (managers), to compare with Google Cloud. */
  clientId?: string | null;
  keysSwapped?: boolean;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [autoAck, setAutoAck] = useState(status?.auto_ack ?? true);
  const [ackText, setAckText] = useState(status?.ack_text ?? "");
  const [signature, setSignature] = useState(status?.signature ?? "");
  const r = result ? RESULT[result] : null;

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5 text-primary" aria-hidden /> Email (support@)
          </CardTitle>
          <CardDescription>Run database update 0035 first.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const running = !!status.last_sync_at && nowMs - new Date(status.last_sync_at).getTime() < 5 * 60_000;
  const changed = autoAck !== status.auto_ack || ackText !== status.ack_text || signature !== status.signature;

  return (
    <Card>
      {dialog}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5 text-primary" aria-hidden /> Email (support@)
        </CardTitle>
        <CardDescription>
          Emails to the support mailbox open tickets by themselves; replies on the same subject (or with the OGT number) go onto the same ticket. Your replies in the app are sent from the mailbox, in the same email conversation.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {r && (
          <p role="status" className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${r.ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/5"}`}>
            {r.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />} {r.text}
          </p>
        )}

        {!configured ? (
          <div className="grid gap-2 rounded-xl border border-dashed p-3 text-sm">
            <p className="font-medium">Step 1 — Google setup (once)</p>
            <p className="text-muted-foreground">
              An administrator creates a Google sign-in for the app (Help → Aftersales → “Connect the support@ Gmail”) and adds <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in Vercel. The address Google asks for (“Authorized redirect URI”) is:
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-muted p-2 text-xs">{redirectUri}</code>
              <Button size="icon" variant="outline" aria-label="Copy the address" onClick={() => navigator.clipboard.writeText(redirectUri).then(() => toast.success("Copied"))}>
                <Copy aria-hidden />
              </Button>
            </div>
          </div>
        ) : !status.connected ? (
          <div className="grid gap-2">
            {keysSwapped && (
              <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                The Client ID and Client secret in Vercel look swapped: GOOGLE_CLIENT_ID should end in .apps.googleusercontent.com and GOOGLE_CLIENT_SECRET usually starts with GOCSPX-.
              </p>
            )}
            {clientId && (
              <div className="grid gap-1 text-xs text-muted-foreground">
                <span>Google Client ID the app is using — it must match Google Cloud → Clients exactly:</span>
                <code className="break-all rounded-lg bg-muted p-2">{clientId}</code>
              </div>
            )}
            <p className="text-sm">Not connected yet. {isManager ? "Connect it, signing in to Google as the support mailbox." : "An Aftersales manager can connect it."}</p>
            {isManager && (
              <Button asChild className="justify-self-start">
                <a href="/api/aftersales/gmail/connect">
                  <Mail aria-hidden /> Connect Gmail
                </a>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <CircleCheck className="size-5 text-success" aria-hidden />
              Connected to <strong className="break-all">{status.mailbox}</strong>
              {status.connected_at && (
                <span className="text-muted-foreground">
                  · {when(status.connected_at)}
                  {status.connected_by ? ` by ${status.connected_by}` : ""}
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">{status.last_sync_at ? `Last checked ${when(status.last_sync_at)}.` : "Not checked yet."}</p>
            {status.last_error && (
              <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <span>
                  {status.last_error}
                  {status.last_error_at && <span className="block text-xs text-muted-foreground">{when(status.last_error_at)}</span>}
                </span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("check");
                  const res = await checkMailNow();
                  setBusy(null);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(res.message ?? (res.data!.imported ? `${res.data!.imported} new ${res.data!.imported === 1 ? "email" : "emails"} (${res.data!.newTickets} new ${res.data!.newTickets === 1 ? "ticket" : "tickets"})` : "No new emails"));
                  router.refresh();
                }}
              >
                {busy === "check" ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Check now
              </Button>
              {isManager && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={!!busy}
                  onClick={async () => {
                    if (!(await confirm("Disconnect Gmail?", { body: "Emails stop coming into tickets and replies are no longer sent from the app. Nothing in Gmail or in the tickets is deleted.", confirmLabel: "Disconnect" }))) return;
                    setBusy("disconnect");
                    const res = await disconnectGmail();
                    setBusy(null);
                    if (!res.ok) return void toast.error(res.error);
                    router.refresh();
                  }}
                >
                  <Unplug aria-hidden /> Disconnect
                </Button>
              )}
            </div>
            {!running && isAdmin && (
              <div className="grid gap-2 rounded-xl border border-dashed p-3 text-sm">
                <p className="font-medium">Checking every minute isn&apos;t running yet</p>
                <p className="text-muted-foreground">
                  In Supabase → SQL Editor, run this once (it uses the same key as the timed reminders). Until then, use <strong>Check now</strong>.
                </p>
                <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs">{mailScheduleSql(siteUrl)}</pre>
                <Button variant="outline" className="justify-self-start" onClick={() => navigator.clipboard.writeText(mailScheduleSql(siteUrl)).then(() => toast.success("Snippet copied"))}>
                  <Copy aria-hidden /> Copy snippet
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 border-t pt-4">
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span>
              <span className="block font-medium">Automatic reply to new tickets</span>
              <span className="block text-sm text-muted-foreground">Tells the customer their ticket number straight away.</span>
            </span>
            <Switch checked={autoAck} onCheckedChange={setAutoAck} disabled={!isManager} aria-label="Automatic reply" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Automatic reply text
            <Textarea value={ackText} onChange={(e) => setAckText(e.target.value)} rows={5} maxLength={4000} disabled={!isManager || !autoAck} />
            <span className="text-xs font-normal text-muted-foreground">
              <code>{"{ticket}"}</code> becomes the ticket number (OGT-1024), <code>{"{name}"}</code> the customer&apos;s name, <code>{"{portal}"}</code> the customer portal&apos;s address.
            </span>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Signature (under every email we send)
            <Textarea value={signature} onChange={(e) => setSignature(e.target.value)} rows={3} maxLength={1000} disabled={!isManager} />
          </label>
          {isManager && (
            <Button
              className="justify-self-start"
              disabled={!changed || busy === "save"}
              onClick={async () => {
                setBusy("save");
                const res = await saveMailOptions({ autoAck, ackText, signature });
                setBusy(null);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Saved");
                router.refresh();
              }}
            >
              {busy === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
