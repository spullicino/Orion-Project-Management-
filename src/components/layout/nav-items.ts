import { Building2, NotebookTabs, ClipboardPenLine, FolderKanban, House, ListChecks, MessagesSquare, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
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

/** Extra items in the desktop sidebar (on phones they're reached from Profile). */
export const SECONDARY_NAV: NavItem[] = [
  { href: "/my-tasks", label: "My Tasks", icon: ListChecks },
  { href: "/personal", label: "Personal", icon: NotebookTabs },
  { href: "/clients", label: "Clients", icon: Building2, minRole: "manager" },
  { href: "/admin", label: "Admin", icon: ShieldCheck, minRole: "admin" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
