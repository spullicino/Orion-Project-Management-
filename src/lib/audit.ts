/** Admin → Audit log: one entry, and turning it into a plain sentence. */
export type AuditEntry = {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity: string;
  entity_id: string | null;
  project_id: string | null;
  project_name: string | null;
  title: string | null;
  changes: Record<string, unknown>;
};

export const AUDIT_ENTITIES: { value: string; label: string }[] = [
  { value: "task", label: "Tasks" },
  { value: "group", label: "Groups" },
  { value: "project", label: "Projects" },
  { value: "project_member", label: "People on projects" },
  { value: "general_task", label: "General tasks" },
  { value: "material_request", label: "Material requests" },
  { value: "daily_update", label: "Daily updates" },
  { value: "comment", label: "Comments" },
  { value: "user", label: "People's details and levels" },
];

const FIELD: Record<string, string> = {
  title: "name",
  name: "name",
  status: "status",
  progress: "progress",
  priority: "priority",
  start_date: "start date",
  due_date: "due date",
  end_date: "end date",
  is_internal: "internal",
  description: "description",
  group: "group",
  role: "level",
  first_name: "first name",
  last_name: "surname",
  work_done: "text",
  hours: "hours",
  issues: "issues",
};

const LABELS: Record<string, string> = {
  not_started: "Not started",
  working: "Working on it",
  waiting: "Waiting",
  done: "Done",
  requested: "Requested",
  ordered: "Ordered",
  partly_delivered: "Partly delivered",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
  active: "Active",
  deactivated: "Deactivated",
  pending: "Waiting for approval",
  admin: "Administrator",
  manager: "Manager",
  technician: "Technician",
  basic: "Basic",
};

function value(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  if (field === "progress") return `${s}%`;
  if (LABELS[s]) return LABELS[s];
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

/** "status Working on it → Done, progress 40% → 60%" */
export function describeChanges(changes: Record<string, unknown>): string {
  return Object.entries(changes)
    .filter(([, c]) => Array.isArray(c))
    .map(([f, c]) => {
      const [from, to] = c as [unknown, unknown];
      if (f === "description" || f === "work_done") return `edited the ${FIELD[f]}`;
      return `${FIELD[f] ?? f.replace(/_/g, " ")} ${value(f, from)} → ${value(f, to)}`;
    })
    .join(", ");
}

/** The sentence after the person's name, e.g. 'deleted task “Partition walls”'. */
export function describeAudit(e: Pick<AuditEntry, "action" | "entity" | "title" | "changes">): string {
  const t = `“${e.title ?? ""}”`;
  const c = e.changes ?? {};
  const changed = describeChanges(c);
  switch (e.entity) {
    case "task":
      if (e.action === "assigned") return `assigned ${c.person} to task ${t}`;
      if (e.action === "unassigned") return `removed ${c.person} from task ${t}`;
      if (e.action === "updated") return `changed task ${t}: ${changed}`;
      if (e.action === "deleted") return `deleted task ${t}${c.reason ? ` (${c.reason})` : ""}`;
      return `${e.action} task ${t}`;
    case "group":
      if (e.action === "updated") return `renamed a group: ${changed}`;
      if (e.action === "deleted") return `deleted group ${t}${typeof c.tasks_deleted === "number" && c.tasks_deleted ? ` and its ${c.tasks_deleted} tasks` : ""}`;
      return `${e.action} group ${t}`;
    case "project":
      return e.action === "updated" ? `changed project ${t}: ${changed}` : `${e.action} project ${t}`;
    case "project_member":
      return e.action === "added" ? `added ${e.title} to the project` : `removed ${e.title} from the project`;
    case "general_task":
      return e.action === "updated" ? `changed general task ${t}: ${changed}` : `${e.action} general task ${t}`;
    case "material_request":
      return e.action === "updated" ? `changed ${e.title}: ${changed}` : `${e.action} ${e.title}`;
    case "daily_update":
      return e.action === "updated" ? `edited ${e.title}: ${changed}` : `deleted ${e.title}${c.text ? `: “${value("text", c.text)}”` : ""}`;
    case "comment":
      return `deleted a comment by ${c.written_by ?? "someone"} on task ${t}${c.comment ? `: “${value("comment", c.comment)}”` : ""}`;
    case "user":
      return `changed ${e.title}'s details: ${changed}`;
    default:
      return `${e.action} ${e.entity} ${t}`;
  }
}
