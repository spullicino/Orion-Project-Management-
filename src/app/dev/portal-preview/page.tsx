import { notFound } from "next/navigation";
import { PortalLogin } from "@/components/portal/portal-login";
import { PortalHome, PortalNewRequest, PortalTicketView } from "@/components/portal/portal-views";
import type { PortalMe } from "@/lib/portal";

const nowMs = () => Date.now();

/** Development-only: the customer portal with sample data (?page=login|home|ticket|new). */
export default async function PortalPreview({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const page = (await searchParams).page ?? "home";
  const now = nowMs();
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  const me: PortalMe = { name: "Anna Zammit", email: "anna@solair.com.mt", customer: "Solair Owners Association", shared: true, sites: [{ id: "s1", name: "Block A" }, { id: "s2", name: "Block B" }] };
  const body =
    page === "login" ? (
      <PortalLogin />
    ) : page === "new" ? (
      <PortalNewRequest me={me} />
    ) : page === "ticket" ? (
      <PortalTicketView
        t={{
          number: 1024, ref: "OGT-1024", subject: "Fire alarm panel beeping – fault on zone 3", status: "waiting", created_at: ago(30), resolved_at: null, site: "Block B", category: "Fire Alarm", handled_by: "Joe",
          messages: [
            { id: "1", mine: true, who: "Anna Zammit", body: "The fire alarm panel in Block B has been beeping since last night and shows a fault on zone 3.", created_at: ago(30) },
            { id: "2", mine: false, who: "Joe · Orion Group", body: "Hi Anna, we'll be on site at 14:00 today. Can the caretaker give us access to the panel room?", created_at: ago(28) },
          ],
          files: [{ id: "f1", file_name: "panel-display.jpg", size_bytes: 412_000, created_at: ago(30) }],
        }}
      />
    ) : (
      <PortalHome
        me={me}
        tickets={[
          { number: 1024, ref: "OGT-1024", subject: "Fire alarm panel beeping – fault on zone 3", status: "waiting", created_at: ago(30), updated_at: ago(2), site: "Block B", contact: "Anna Zammit" },
          { number: 1030, ref: "OGT-1030", subject: "Intercom not ringing flat 5", status: "in_progress", created_at: ago(10), updated_at: ago(1), site: "Block A", contact: "Ben Vella" },
          { number: 1002, ref: "OGT-1002", subject: "CCTV camera 3 offline", status: "closed", created_at: ago(400), updated_at: ago(300), site: "Block A", contact: "Anna Zammit" },
        ]}
      />
    );
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Orion · Customer portal</div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6">{body}</main>
    </div>
  );
}
