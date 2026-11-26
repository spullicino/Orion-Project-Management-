import type { Metadata } from "next";
import { VariationsView } from "@/components/board/variations-view";
import { getBoard } from "@/lib/data/projects";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const board = await getBoard((await params).projectId).catch(() => null);
  return { title: board ? `${board.project.name} · Variations` : "Project" };
}

export default function VariationsPage() {
  return <VariationsView />;
}
