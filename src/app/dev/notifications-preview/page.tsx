import { notFound } from "next/navigation";
import { NotificationsPreviewClient } from "@/dev/notifications-preview-client";

/** Development-only preview of the notification screens with sample data. */
export default function NotificationsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <NotificationsPreviewClient />
    </main>
  );
}
