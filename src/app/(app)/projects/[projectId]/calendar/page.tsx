import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { getBoard } from "@/lib/data/projects";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const board = await getBoard((await params).projectId).catch(() => null);
  return { title: board ? `${board.project.name} · Calendar` : "Project" };
}

export default function CalendarPage() {
  return <CalendarView />;
}
