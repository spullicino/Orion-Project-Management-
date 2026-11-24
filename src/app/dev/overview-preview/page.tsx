import { notFound } from "next/navigation";
import { TeamOverviewCards } from "@/components/overview/team-overview";
import { overviewFixture } from "@/dev/overview-fixture";

/** Development-only preview of the managers' Team overview (no database). */
export default async function OverviewPreview({
  searchParams,
}: {
  searchParams: Promise<{ size?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const size = (await searchParams).size === "full" ? "full" : "compact";
  const { status, feed, requests } = overviewFixture();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <TeamOverviewCards
        size={size}
        status={status}
        feed={feed}
        requests={requests}
      />
    </main>
  );
}
