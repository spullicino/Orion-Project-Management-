"use client";

import { Check, Copy, KeyRound, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { generateSetupKeys } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";

type Status = { push: boolean; cron: boolean; email: boolean };

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

export function SetupCard({ status }: { status: Status }) {
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string; cronSecret: string } | null>(null);
  return (
    <div className="grid gap-4">
      <ul className="divide-y">
        <Row ok={status.push} label="Phone push notifications" hint="Add NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in Vercel (generate them below)." />
        <Row ok={status.cron} label="Daily job (reminders & summary)" hint="Add CRON_SECRET in Vercel (generate below)." />
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
