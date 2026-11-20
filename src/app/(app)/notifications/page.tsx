import { Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { Button } from "@/components/ui/button";
import { requireActiveProfile } from "@/lib/auth/session";
import { loadNotifications } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireActiveProfile();
  const res = await loadNotifications();
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <Button asChild variant="ghost">
            <Link href="/profile#notifications">
              <Settings aria-hidden /> Settings
            </Link>
          </Button>
        }
      />
      <div className="max-w-3xl">
        <NotificationsList initial={res.ok ? (res.data ?? []) : []} />
      </div>
    </>
  );
}
