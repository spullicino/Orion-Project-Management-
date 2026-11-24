"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UnreadBadge } from "@/components/chat/unread-provider";
import { isActive, phoneNav } from "./nav-items";

export function BottomTabs({ isManager = false, newRequests = 0 }: { isManager?: boolean; newRequests?: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-safe md:hidden"
    >
      <ul className="grid grid-cols-5">
        {phoneNav(isManager).map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className={cn("size-6", active && "stroke-[2.4]")} aria-hidden />
                  {href === "/chats" && <UnreadBadge className="absolute -right-3 -top-1.5" />}
                  {href === "/overview" && <CountBadge count={newRequests} label="new material requests" className="absolute -right-3 -top-1.5" />}
                </span>
                <span className="text-center">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Red number bubble, like the chat badge. */
export function CountBadge({ count, label, className = "" }: { count: number; label: string; className?: string }) {
  if (!count) return null;
  return (
    <span className={`inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-5 text-white ${className}`} aria-label={`${count} ${label}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
