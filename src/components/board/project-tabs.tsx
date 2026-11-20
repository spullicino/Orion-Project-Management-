"use client";

import { CalendarDays, Columns3, GanttChartSquare, Images, MessagesSquare, NotebookPen, Settings, Table2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProjectTabs({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/projects/${projectId}/board`, label: "Board", icon: Table2 },
    { href: `/projects/${projectId}/kanban`, label: "Kanban", icon: Columns3 },
    { href: `/projects/${projectId}/gantt`, label: "Gantt", icon: GanttChartSquare },
    { href: `/projects/${projectId}/calendar`, label: "Calendar", icon: CalendarDays },
    { href: `/projects/${projectId}/diary`, label: "Diary", icon: NotebookPen },
    { href: `/projects/${projectId}/photos`, label: "Photos", icon: Images },
    { href: `/projects/${projectId}/chat`, label: "Chat", icon: MessagesSquare },
    ...(canManage ? [{ href: `/projects/${projectId}/settings`, label: "Settings", icon: Settings }] : []),
  ];
  return (
    <nav aria-label="Project views" className="-mx-4 mb-5 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center gap-2 border-b-2 px-3 text-sm font-medium",
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
