"use client";

// Development-only: notification screens with sample data.
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export function NotificationsPreviewClient() {
  return (
    <NotificationsProvider userId="preview" initial={3}>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <NotificationsList
          initial={[
            { id: "n1", type: "mention", title: "Mark Borg mentioned you in Valletta Office Fit-out", body: "@Tina can you check the east wall?", link: "/chats/x", read_at: null, created_at: ago(3) },
            { id: "n2", type: "task.assigned", title: "Mark Borg assigned you a task", body: "Data cabling", link: "/projects/p/board?task=t", read_at: null, created_at: ago(40) },
            { id: "n3", type: "task.overdue", title: "Overdue: Electrical first fix", body: null, link: "/projects/p/board?task=t4", read_at: null, created_at: ago(60 * 7) },
            { id: "n4", type: "daily.new", title: "Tom Debono posted a daily update · Mosta Solar Installation", body: "Mounting rails installed on south roof.", link: "/projects/p/diary", read_at: ago(60), created_at: ago(60 * 26) },
          ]}
        />
        <NotificationSettings initial={{ push_enabled: true, email_digest: false, types: { "daily.new": false }, quiet_hours_from: "21:00", quiet_hours_to: "07:00" }} pushAvailable />
      </div>
    </NotificationsProvider>
  );
}
