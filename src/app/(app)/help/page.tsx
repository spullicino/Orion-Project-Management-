import type { Metadata } from "next";
import { HelpView } from "@/components/help/help-view";
import { PageHeader } from "@/components/layout/page-header";
import { requireActiveProfile } from "@/lib/auth/session";
import { HELP_TOPICS } from "@/lib/help";

export const metadata: Metadata = { title: "Help" };

export default async function HelpPage() {
  const me = await requireActiveProfile();
  return (
    <>
      <PageHeader title="Help" description="Step-by-step guides for every part of Orion Projects." />
      <div className="max-w-3xl">
        <HelpView topics={HELP_TOPICS} role={me.role} />
      </div>
    </>
  );
}
