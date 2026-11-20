import type { Metadata } from "next";
import { BoardView } from "@/components/board/board-view";
import { getBoard } from "@/lib/data/projects";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const board = await getBoard((await params).projectId).catch(() => null);
  return { title: board ? `${board.project.name} · Board` : "Project" };
}

export default function BoardPage() {
  return <BoardView />;
}
