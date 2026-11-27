"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/aftersales", label: "Tickets", match: (p: string) => p === "/aftersales" || p.startsWith("/aftersales/tickets") },
  { href: "/aftersales/customers", label: "Customers & sites", match: (p: string) => p.startsWith("/aftersales/customers") },
  { href: "/aftersales/settings", label: "Settings", match: (p: string) => p.startsWith("/aftersales/settings") },
];

export function AftersalesTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Aftersales" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
