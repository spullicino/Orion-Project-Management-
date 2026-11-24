import { notFound } from "next/navigation";
import { DiaryPreviewClient } from "@/dev/diary-preview-client";

/** Development-only preview of the daily diary screens with sample data. */
export default async function DiaryPreview({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await searchParams;
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <DiaryPreviewClient view={view} />
    </main>
  );
}
