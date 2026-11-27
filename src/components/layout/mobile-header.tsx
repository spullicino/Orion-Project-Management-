import { Activity, CircleHelp, History } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { NotificationBell } from "@/components/notifications/notifications-provider";
import { RefreshButton } from "@/components/pwa/refresh";
import { UserAvatar } from "@/components/ui/avatar";
import type { Profile } from "@/types/database";

export function MobileHeader({ profile, avatarUrl }: { profile: Profile; avatarUrl: string | null }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/95 px-4 pt-safe backdrop-blur md:hidden">
      <Link href="/home" aria-label="Orion Projects home">
        <Logo showText={false} />
      </Link>
      {/* On the narrowest phones (e.g. iPhone SE) the buttons are a little narrower so they all fit. */}
      <div className="flex items-center max-[359px]:[&>*]:!w-10">
      {profile.role === "admin" && (
        <Link href="/admin/activity" aria-label="Activity — who's using the app" className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
          <Activity className="size-5" aria-hidden />
        </Link>
      )}
      {profile.role === "admin" && (
        <Link href="/admin/audit" aria-label="Audit log — who changed or deleted what" className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
          <History className="size-5" aria-hidden />
        </Link>
      )}
      <RefreshButton />
      <Link href="/help" aria-label="Help" className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
        <CircleHelp className="size-5" aria-hidden />
      </Link>
      <NotificationBell />
      <Link href="/profile" aria-label="Your profile" className="flex size-11 items-center justify-center">
        <UserAvatar person={profile} src={avatarUrl} size={32} />
      </Link>
      </div>
    </header>
  );
}
