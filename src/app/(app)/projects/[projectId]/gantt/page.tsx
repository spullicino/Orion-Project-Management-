import type { Metadata } from "next";
import { GanttView } from "@/components/gantt/gantt-view";
import { getBoard } from "@/lib/data/projects";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const board = await getBoard((await params).projectId).catch(() => null);
  return { title: board ? `${board.project.name} · Gantt` : "Project" };
}

export default function GanttPage() {
  return <GanttView />;
}
