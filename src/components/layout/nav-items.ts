import { Boxes, Headset, LayoutDashboard, Building2, CircleHelp, Package, NotebookTabs, ClipboardPenLine, FolderKanban, House, ListChecks, MessagesSquare, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import type { AppRole } from "@/types/database";

export type NavItem = { href: string; label: string; icon: LucideIcon; minRole?: AppRole };

/** Bottom tab bar on phones: exactly these five. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: House },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/daily-update", label: "Daily Update", icon: ClipboardPenLine },
  { href: "/chats", label: "Chats", icon: MessagesSquare },
  { href: "/profile", label: "Profile", icon: UserRound },
];

/** Managers and admins get Overview instead of Daily Update in the phone tab bar (posting is a button on Overview). */
export const OVERVIEW_ITEM: NavItem = { href: "/overview", label: "Overview", icon: LayoutDashboard, minRole: "manager" };

export function phoneNav(isManager: boolean): NavItem[] {
  return isManager ? PRIMARY_NAV.map((i) => (i.href === "/daily-update" ? OVERVIEW_ITEM : i)) : PRIMARY_NAV;
}

/** Desktop sidebar: Overview goes right after Home for managers and admins. */
export function sidebarNav(isManager: boolean): NavItem[] {
  return isManager ? [PRIMARY_NAV[0], OVERVIEW_ITEM, ...PRIMARY_NAV.slice(1)] : PRIMARY_NAV;
}

/** Extra items in the desktop sidebar (on phones they're reached from Profile). */
export const SECONDARY_NAV: NavItem[] = [
  { href: "/my-tasks", label: "My Tasks", icon: ListChecks },
  { href: "/materials", label: "Materials", icon: Package },
  { href: "/personal", label: "Personal", icon: NotebookTabs },
  { href: "/products", label: "Products", icon: Boxes, minRole: "manager" },
  { href: "/clients", label: "Clients", icon: Building2, minRole: "manager" },
  { href: "/admin", label: "Admin", icon: ShieldCheck, minRole: "admin" },
  { href: "/help", label: "Help", icon: CircleHelp },
];

/** Modules — only for people an administrator gave access to (Admin → Modules). */
export const AFTERSALES_ITEM: NavItem = { href: "/aftersales", label: "Aftersales", icon: Headset };

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
