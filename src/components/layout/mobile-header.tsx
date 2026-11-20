import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { NotificationBell } from "@/components/notifications/notifications-provider";
import { UserAvatar } from "@/components/ui/avatar";
import type { Profile } from "@/types/database";

export function MobileHeader({ profile, avatarUrl }: { profile: Profile; avatarUrl: string | null }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/95 px-4 pt-safe backdrop-blur md:hidden">
      <Link href="/home" aria-label="Orion Projects home">
        <Logo showText={false} />
      </Link>
      <div className="flex items-center">
      <NotificationBell />
      <Link href="/profile" aria-label="Your profile" className="flex size-11 items-center justify-center">
        <UserAvatar person={profile} src={avatarUrl} size={32} />
      </Link>
      </div>
    </header>
  );
}
