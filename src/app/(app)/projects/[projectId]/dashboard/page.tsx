import type { Metadata } from "next";
import { ProjectDashboard } from "@/components/dashboard/project-dashboard";
import { requireActiveProfile } from "@/lib/auth/session";
import { addDays, todayISO } from "@/lib/board";
import { getDailyFeed } from "@/lib/data/diary";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireActiveProfile();
  const today = todayISO();
  const recent = await getDailyFeed({ project: projectId, from: addDays(today, -6), to: today, limit: 50 }, { fullPhotos: false }).catch(() => []);
  return (
    <ProjectDashboard
      diary={{ count: recent.length, people: new Set(recent.map((u) => u.author_id)).size, last: recent[0]?.work_date ?? null }}
    />
  );
}
