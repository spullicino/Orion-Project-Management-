import { UnreadProvider } from "@/components/chat/unread-provider";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { BottomTabs } from "@/components/layout/bottom-tabs";
import { MobileHeader } from "@/components/layout/mobile-header";
import { Sidebar } from "@/components/layout/sidebar";
import {
  OutboxPanel,
  OutboxProvider,
} from "@/components/diary/outbox-provider";
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
  const [[avatarUrl], unread, notifCount] = await Promise.all([
    resolveAvatarUrls(supabase, [profile.avatar_url]),
    // Badges work once the related database updates have been run; until then they show nothing.
    supabase.rpc("get_unread_total").then((r) => (r.error ? 0 : Number(r.data ?? 0))),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .then((r) => r.count ?? 0),
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
          <Sidebar profile={profile} avatarUrl={avatarUrl} />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader profile={profile} avatarUrl={avatarUrl} />
            <main
              id="main"
              className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8"
            >
              <OutboxPanel compact />
              {children}
            </main>
          </div>
          <BottomTabs />
        </div>
      </NotificationsProvider>
      </UnreadProvider>
    </OutboxProvider>
  );
}
