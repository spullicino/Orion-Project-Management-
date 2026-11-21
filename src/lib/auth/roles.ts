import type { AppRole } from "@/types/database";

/**
 * Plain-language descriptions of each user level. The real enforcement lives in
 * the database (Row Level Security); these helpers only decide what the UI shows.
 */
export const ROLES: { value: AppRole; label: string; description: string }[] = [
  { value: "admin", label: "Administrator", description: "Everything: settings, users, all projects, management chat." },
  { value: "manager", label: "Manager", description: "Create projects and run the projects they're on: people, Gantt charts and client exports." },
  { value: "technician", label: "Technician", description: "Work on assigned projects: update tasks, daily updates, photos, chat." },
  { value: "basic", label: "Basic", description: "Read-only access to assigned projects." },
];

export const ROLE_LABEL: Record<AppRole, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<
  AppRole,
  string
>;

const RANK: Record<AppRole, number> = { basic: 0, technician: 1, manager: 2, admin: 3 };

/** True if `role` is at least `minimum` (admin > manager > technician > basic). */
export function hasRole(role: AppRole | null | undefined, minimum: AppRole) {
  return role != null && RANK[role] >= RANK[minimum];
}

export const can = {
  manageUsers: (r?: AppRole | null) => hasRole(r, "admin"),
  manageSettings: (r?: AppRole | null) => hasRole(r, "admin"),
  createProjects: (r?: AppRole | null) => hasRole(r, "manager"),
  /** Managers+ get project-wide views (e.g. "needs attention") — for the projects they can see. */
  seeAllProjects: (r?: AppRole | null) => hasRole(r, "manager"),
  managementChat: (r?: AppRole | null) => hasRole(r, "manager"),
  editAssignedWork: (r?: AppRole | null) => hasRole(r, "technician"),
  postDailyUpdate: (r?: AppRole | null) => hasRole(r, "technician"),
};
