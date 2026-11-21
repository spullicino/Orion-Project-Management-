import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { WhatsNewButton } from "@/components/whats-new";
import { hasRole } from "@/lib/auth/roles";
import { whatsNewFor } from "@/lib/whats-new";

/** Development-only preview of the Home greeting with the What's new button. */
export default async function WhatsNewPreview({ searchParams }: { searchParams: Promise<{ seen?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { seen } = await searchParams;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <PageHeader title="Good afternoon, Sarah" description="You are signed in as Administrator" actions={<WhatsNewButton entries={whatsNewFor("admin", hasRole)} seen={seen ?? null} preview />} />
    </main>
  );
}
