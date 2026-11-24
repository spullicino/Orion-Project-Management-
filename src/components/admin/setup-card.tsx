"use client";

import { Check, Copy, KeyRound, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { generateSetupKeys } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";

type Status = { push: boolean; cron: boolean; email: boolean };

/** The one-time Supabase snippet that wakes the app every 15 minutes for timed reminders. */
export function reminderScheduleSql(siteUrl: string) {
  return `-- Orion Projects: check every 15 minutes for the daily update reminder.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'orion-reminders',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := '${siteUrl}/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select token from public.job_secrets where name = 'reminders')),
    timeout_milliseconds := 30000
  );
  $job$
);`;
}

function Row({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
      {ok ? <Check className="mt-0.5 size-5 shrink-0 text-success" aria-label="Set up" /> : <X className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Not set up" />}
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{ok ? "Set up." : hint}</span>
      </span>
    </li>
  );
}

function Secret({ name, value }: { name: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{name}</span>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-3 py-2 text-xs">{value}</code>
        <Button
          size="icon"
          variant="outline"
          aria-label={`Copy ${name}`}
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(`${name} copied`))}
        >
          <Copy />
        </Button>
      </div>
    </div>
  );
}

export function SetupCard({ status, reminder }: { status: Status; reminder?: { siteUrl: string; checkedAt: string | null; migrated: boolean; running: boolean } }) {
  const [showSql, setShowSql] = useState(false);
  const running = !!reminder?.running;
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string; cronSecret: string } | null>(null);
  return (
    <div className="grid gap-4">
      <ul className="divide-y">
        <Row ok={status.push} label="Phone push notifications" hint="Add NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in Vercel (generate them below)." />
        <Row ok={status.cron} label="Daily job (reminders & summary)" hint="Add CRON_SECRET in Vercel (generate below)." />
        {reminder && (
          <li className="grid gap-2 py-2">
            <div className="flex items-start gap-3">
              {running ? <Check className="mt-0.5 size-5 shrink-0 text-success" aria-label="Set up" /> : <X className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Not set up" />}
              <span className="min-w-0">
                <span className="block font-medium">Timed reminders (daily update reminder)</span>
                <span className="block text-sm text-muted-foreground">
                  {!reminder.migrated
                    ? "Run database update 0023 first."
                    : running
                      ? `Working — last check ${new Date(reminder.checkedAt!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" })}.`
                      : "Not running yet. In Supabase → SQL Editor, run the snippet below once. This page shows a tick within 15 minutes."}
                </span>
              </span>
            </div>
            {reminder.migrated && (
              <div className="grid gap-2 pl-8">
                <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setShowSql((v) => !v)}>
                  {showSql ? "Hide snippet" : running ? "Show the Supabase snippet again" : "Show the Supabase snippet"}
                </Button>
                {showSql && (
                  <div className="grid gap-2">
                    <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs">{reminderScheduleSql(reminder.siteUrl)}</pre>
                    <Button
                      variant="outline"
                      className="justify-self-start"
                      onClick={() => navigator.clipboard.writeText(reminderScheduleSql(reminder.siteUrl)).then(() => toast.success("Snippet copied"))}
                    >
                      <Copy aria-hidden /> Copy snippet
                    </Button>
                  </div>
                )}
              </div>
            )}
          </li>
        )}
        <Row ok={status.email} label="Daily email summary" hint="Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM in Vercel (same details as Supabase's email settings)." />
      </ul>
      {!keys ? (
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={async () => {
            const res = await generateSetupKeys();
            if (res.ok) setKeys(res);
            else toast.error(res.error);
          }}
        >
          <KeyRound aria-hidden /> Generate keys for Vercel
        </Button>
      ) : (
        <div className="grid gap-3 rounded-xl border p-4">
          <p className="text-sm">
            Copy each value into <strong>Vercel → Settings → Environment Variables</strong>, then redeploy. These are shown only now and are not saved anywhere —
            keep the private key and secret private. Only generate push keys once: new keys mean everyone has to turn notifications on again.
          </p>
          <Secret name="NEXT_PUBLIC_VAPID_PUBLIC_KEY" value={keys.publicKey} />
          <Secret name="VAPID_PRIVATE_KEY" value={keys.privateKey} />
          <Secret name="CRON_SECRET" value={keys.cronSecret} />
          <p className="text-sm text-muted-foreground">Also add VAPID_SUBJECT = mailto: followed by your email, e.g. mailto:you@oriongroup.com.mt</p>
        </div>
      )}
    </div>
  );
}
