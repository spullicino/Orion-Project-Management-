import { notFound } from "next/navigation";
import { BannerView, type AdminBanner } from "@/components/admin/banner-view";
import { PageHeader } from "@/components/layout/page-header";

const nowMs = () => Date.now();

/** Development-only preview of Admin → Banner (no database). */
export default function BannerPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const now = nowMs();
  const at = (h: number) => new Date(now + h * 3600_000).toISOString();
  const b = (id: string, body: string, tone: AdminBanner["tone"], starts: number, ends: number | null, extra: Partial<AdminBanner> = {}): AdminBanner => ({
    id, body, tone, link: null, starts_at: at(starts), ends_at: ends === null ? null : at(ends), paused: false,
    audience_type: "everyone", audience_roles: [], audience_projects: [], audience_people: [], author: "Sarah Pullicino", ...extra,
  });
  const banners = [
    b("1", "Toolbox talk on Monday at 7:30 in the yard — attendance is required", "reminder", -5, 70, { link: "/help" }),
    b("2", "Wear hard hats on the Mosta site at all times", "urgent", -48, null, { audience_type: "levels", audience_roles: ["technician"] }),
    b("6", "Turn on notifications so you don't miss tasks and messages — tap here", "reminder", -2, 150, { link: "/profile#notifications" }),
    b("3", "Office closed on 8 December", "info", 100, 140),
    b("4", "New PPE available from stores", "info", -24, 48, { paused: true, audience_type: "projects", audience_projects: ["p1"] }),
    b("5", "Christmas lunch sign-up closes today", "info", -100, -2),
  ];
  return (
    <>
      <PageHeader title="Banner" description="Short announcements and reminders in a strip at the top of every screen. You choose who sees them and for how long." />
      <BannerView
        banners={banners}
        people={[{ id: "u1", name: "Joe Vella", role: "technician" }, { id: "u2", name: "Mark Borg", role: "manager" }]}
        projects={[{ id: "p1", name: "OG5376 - Solair Apartments" }]}
      />
    </>
  );
}
