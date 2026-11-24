import { notFound } from "next/navigation";
import { ActivityView, type ActivityPerson } from "@/components/admin/activity-view";
import { PageHeader } from "@/components/layout/page-header";

const nowMs = () => Date.now();

/** Development-only preview of Admin → Activity (no database). */
export default function ActivityPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const now = nowMs();
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  const day = (d: number) => new Date(now - d * 86400_000).toISOString().slice(0, 10);
  const p = (id: string, first: string, last: string, role: ActivityPerson["role"], seen: string | null, update: string | null, push: boolean, projects: string[]): ActivityPerson => ({
    id, first_name: first, last_name: last, email: `${first || id}@example.com`.toLowerCase(), avatar_url: null, role, status: "active", last_seen_at: seen, last_update: update, push_on: push, projects,
  });
  const people = [
    p("a", "", "", "technician", null, null, false, ["OG5376 - Solair Apartments"]),
    p("b", "Joe", "Vella", "technician", ago(24 * 9), day(9), true, ["OG5545 - Embark - Qormi", "OG5371 - San Guzepp"]),
    p("c", "Alexander", "Hamburger", "technician", ago(24 * 4), day(4), false, ["OG5698 - Central Bank"]),
    p("d", "Mark", "Borg", "manager", ago(30), null, true, ["OG5376 - Solair Apartments"]),
    p("e", "Muhammad", "Mozumder", "technician", ago(2), day(0), true, ["OG5371 - San Guzepp"]),
    p("f", "Sarah", "Pullicino", "admin", ago(0.1), null, true, []),
  ];
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <PageHeader title="Activity" description="Who is using the app — and who isn't." />
      <ActivityView people={people} now={now} />
    </main>
  );
}
