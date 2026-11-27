import type { Metadata } from "next";
import { MailSettings, type MailStatus } from "@/components/aftersales/mail-settings";
import { AftersalesSettings } from "@/components/aftersales/settings-view";
import { SlaSettingsCard, type SlaSettings } from "@/components/aftersales/sla-settings";
import { PageHeader } from "@/components/layout/page-header";
import { gmailConfigured, gmailRedirectUri } from "@/lib/mail/gmail";
import { requireModule } from "@/lib/modules";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings · Aftersales" };
const nowMs = () => Date.now();

export default async function AftersalesSettingsPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const { profile, level } = await requireModule("aftersales");
  const supabase = await createClient();
  const [{ data: categories }, mail, site, sp, sla, { data: holidays }] = await Promise.all([
    supabase.from("as_categories").select("id, name, active").order("position"),
    supabase.rpc("aftersales_mail_status"),
    getSiteUrl(),
    searchParams,
    supabase.from("as_sla_settings").select("work_start, work_end, work_days, targets, auto_close_days").eq("id", true).maybeSingle(),
    supabase.from("as_holidays").select("day, name").order("day"),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Malta" }).format(new Date(nowMs()));
  return (
    <>
      <PageHeader title="Aftersales settings" />
      <AftersalesSettings
        categories={categories ?? []}
        isManager={level === "manager"}
        sla={<SlaSettingsCard settings={sla.error ? null : (sla.data as SlaSettings | null)} holidays={holidays ?? []} isManager={level === "manager"} today={today} />}
        mail={
          <MailSettings
            status={mail.error ? null : (mail.data as MailStatus | null)}
            configured={gmailConfigured()}
            isManager={level === "manager"}
            isAdmin={profile.role === "admin"}
            siteUrl={site}
            redirectUri={gmailRedirectUri(site)}
            result={sp.gmail}
            nowMs={nowMs()}
          />
        }
      />
    </>
  );
}
