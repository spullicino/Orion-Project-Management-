"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { UnreadBadge } from "@/components/chat/unread-provider";
import { NotificationBell } from "@/components/notifications/notifications-provider";
import { UserAvatar } from "@/components/ui/avatar";
import { hasRole, ROLE_LABEL } from "@/lib/auth/roles";
import { cn, fullName } from "@/lib/utils";
import type { Profile } from "@/types/database";
import { SECONDARY_NAV, isActive, sidebarNav, type NavItem } from "./nav-items";
import { CountBadge } from "./bottom-tabs";
import { RefreshButton } from "@/components/pwa/refresh";

function NavLink({ item, pathname, newRequests, ticketCount }: { item: NavItem; pathname: string; newRequests?: number; ticketCount?: number }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.href === "/chats" && <UnreadBadge />}
      {item.href === "/overview" && <CountBadge count={newRequests ?? 0} label="new material requests" />}
      {item.href === "/aftersales" && <CountBadge count={ticketCount ?? 0} label="tickets for you" />}
    </Link>
  );
}

export function Sidebar({
  profile,
  avatarUrl,
  newRequests = 0,
  aftersales = false,
  ticketCount = 0,
}: {
  profile: Profile;
  avatarUrl: string | null;
  newRequests?: number;
  /** Can use the Aftersales module. */
  aftersales?: boolean;
  ticketCount?: number;
}) {
  const pathname = usePathname();
  const secondary = SECONDARY_NAV.filter((i) => !i.minRole || hasRole(profile.role, i.minRole));
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card md:flex">
      <div className="px-5 py-5">
        <Link href="/home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 px-3">
        {sidebarNav(hasRole(profile.role, "manager"), aftersales).map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} newRequests={newRequests} ticketCount={ticketCount} />
        ))}
        <NotificationBell withLabel />
        <RefreshButton withLabel />
        {secondary.length > 0 && <div className="my-3 h-px bg-border" />}
        {secondary.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
      <Link href="/profile" className="m-3 flex items-center gap-3 rounded-lg p-2 hover:bg-accent">
        <UserAvatar person={profile} src={avatarUrl} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{fullName(profile)}</span>
          <span className="block text-xs text-muted-foreground">{ROLE_LABEL[profile.role]}</span>
        </span>
      </Link>
    </aside>
  );
}
