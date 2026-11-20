import type { Metadata } from "next";
import { KanbanView } from "@/components/board/kanban-view";
import { getBoard } from "@/lib/data/projects";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const board = await getBoard((await params).projectId);
  return { title: board ? `${board.project.name} · Kanban` : "Project" };
}

export default function KanbanPage() {
  return <KanbanView />;
}
