import { UnreadProvider } from "@/components/chat/unread-provider";
import { InstallPrompt, OfflineBanner, OfflineWarmup } from "@/components/pwa/app-helpers";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { ActivityPing } from "@/components/activity-ping";
import { AnnouncementGate } from "@/components/announcement-gate";
import { PullToRefresh, UpdateBanner } from "@/components/pwa/refresh";
import { BottomTabs } from "@/components/layout/bottom-tabs";
import { MobileHeader } from "@/components/layout/mobile-header";
import { TopBanner } from "@/components/layout/top-banner";
import { loadMyBanner } from "@/lib/data/banner";
import { Sidebar } from "@/components/layout/sidebar";
import {
  OutboxPanel,
  OutboxProvider,
} from "@/components/diary/outbox-provider";
import { hasRole } from "@/lib/auth/roles";
import { requireActiveProfile } from "@/lib/auth/session";
import { resolveAvatarUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/** Shell for every signed-in, approved screen. Pending/deactivated users are sent to /pending. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireActiveProfile();
  const supabase = await createClient();
  const isManager = hasRole(profile.role, "manager");
  const [[avatarUrl], unread, notifCount, newRequests, banner] = await Promise.all([
    resolveAvatarUrls(supabase, [profile.avatar_url]),
    // Badges work once the related database updates have been run; until then they show nothing.
    supabase.rpc("get_unread_total").then((r) => (r.error ? 0 : Number(r.data ?? 0))),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .then((r) => r.count ?? 0),
    // Managers' Overview badge: material requests nobody has ordered yet.
    isManager
      ? supabase
          .from("material_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "requested")
          .then((r) => (r.error ? 0 : (r.count ?? 0)))
      : Promise.resolve(0),
    loadMyBanner(supabase),
  ]);

  return (
    <OutboxProvider userId={profile.id}>
      <UnreadProvider initial={unread}>
      <NotificationsProvider userId={profile.id} initial={notifCount}>
        <div className="flex min-h-dvh">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3 focus:shadow"
          >
            Skip to content
          </a>
          <Sidebar profile={profile} avatarUrl={avatarUrl} newRequests={newRequests} />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader profile={profile} avatarUrl={avatarUrl} />
            <TopBanner initial={banner} />
            <OfflineBanner />
            <main
              id="main"
              className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8"
            >
              <OutboxPanel compact />
              {children}
            </main>
          </div>
          <BottomTabs isManager={isManager} newRequests={newRequests} />
          <InstallPrompt />
          <OfflineWarmup />
          <ActivityPing />
          <AnnouncementGate />
          <PullToRefresh />
          <UpdateBanner />
        </div>
      </NotificationsProvider>
      </UnreadProvider>
    </OutboxProvider>
  );
}
