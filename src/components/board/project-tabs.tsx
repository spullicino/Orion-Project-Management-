"use client";

import { CalendarDays, FileDiff, LayoutDashboard, Columns3, GanttChartSquare, Images, MessagesSquare, NotebookPen, Settings, Table2, Package } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function ProjectTabs({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  // On phones the tabs scroll sideways: keep the open one in view (e.g. Chat, Materials).
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const box = nav.current;
    if (!el || !box) return;
    const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    box.scrollLeft += a.left - b.left - (b.width - a.width) / 2;
  }, [pathname]);
  const tabs = [
    { href: `/projects/${projectId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { href: `/projects/${projectId}/board`, label: "Board", icon: Table2 },
    { href: `/projects/${projectId}/kanban`, label: "Kanban", icon: Columns3 },
    { href: `/projects/${projectId}/gantt`, label: "Gantt", icon: GanttChartSquare },
    { href: `/projects/${projectId}/calendar`, label: "Calendar", icon: CalendarDays },
    { href: `/projects/${projectId}/diary`, label: "Diary", icon: NotebookPen },
    { href: `/projects/${projectId}/photos`, label: "Photos", icon: Images },
    { href: `/projects/${projectId}/materials`, label: "Materials", icon: Package },
    { href: `/projects/${projectId}/variations`, label: "Variations", icon: FileDiff },
    { href: `/projects/${projectId}/chat`, label: "Chat", icon: MessagesSquare },
    ...(canManage ? [{ href: `/projects/${projectId}/settings`, label: "Settings", icon: Settings }] : []),
  ];
  return (
    <nav ref={nav} aria-label="Project views" className="-mx-4 mb-5 overflow-x-auto overscroll-x-contain border-b px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex gap-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
