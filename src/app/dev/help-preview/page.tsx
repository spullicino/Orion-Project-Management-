import { notFound } from "next/navigation";
import { HelpView } from "@/components/help/help-view";
import { HELP_TOPICS } from "@/lib/help";
import type { AppRole } from "@/types/database";

/** Development-only preview of the Help page (no database needed). */
export default async function HelpPreview({
  searchParams,
}: {
  searchParams: Promise<{ role?: AppRole }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { role } = await searchParams;
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-8">
      <h1 className="mb-4 text-2xl font-bold">Help</h1>
      <HelpView topics={HELP_TOPICS} role={role ?? "technician"} />
    </main>
  );
}
