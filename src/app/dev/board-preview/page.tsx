import { notFound } from "next/navigation";
import { previewBoard } from "@/dev/fixtures";
import { PreviewClient } from "@/dev/preview-client";

/** Development-only visual preview of the board with sample data (no database needed). */
export default async function BoardPreview({ searchParams }: { searchParams: Promise<{ view?: string; role?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view, role } = await searchParams;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <h1 className="mb-4 text-2xl font-bold">{previewBoard.project.name}</h1>
      <PreviewClient view={view} manager={role !== "basic"} />
    </main>
  );
}
