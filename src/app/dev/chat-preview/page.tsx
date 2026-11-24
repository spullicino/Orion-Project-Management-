import { notFound } from "next/navigation";
import { ChatPreviewClient } from "@/dev/chat-preview-client";

/** Development-only preview of the chat screens with sample data. */
export default async function ChatPreview({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await searchParams;
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <ChatPreviewClient view={view} />
    </main>
  );
}
