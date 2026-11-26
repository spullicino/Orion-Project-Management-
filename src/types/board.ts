import type { AppRole, RepeatRule } from "./database";

export type Priority = "low" | "medium" | "high" | "critical";
export type VariationApproval = "pending" | "approved" | "rejected";
export const VARIATION_APPROVAL: Record<VariationApproval, { label: string; tone: string }> = {
  pending: { label: "Awaiting client approval", tone: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" },
  approved: { label: "Approved by client", tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  rejected: { label: "Rejected by client", tone: "bg-destructive/10 text-destructive" },
};
/** "VO-001" */
export const voNumber = (n: number) => `VO-${String(n).padStart(3, "0")}`;
export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";
export type ColumnKind = "text" | "number" | "file";

/** Built-in board columns that can be hidden per project. */
export const BUILTIN_COLUMNS = ["status", "owners", "priority", "start_date", "due_date", "progress", "dependencies"] as const;
export type BuiltinColumn = (typeof BUILTIN_COLUMNS)[number];

export type StatusLabel = { id: string; project_id: string; name: string; color: string; position: number; is_done: boolean };
export type CustomColumn = { id: string; project_id: string; name: string; kind: ColumnKind; position: number };
export type Group = { id: string; project_id: string; name: string; color: string; position: number; collapsed: boolean };

export type BoardTask = {
  id: string;
  project_id: string;
  group_id: string;
  title: string;
  status_id: string | null;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  position: number;
  custom_values: Record<string, string | number | null>;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Repeats when it's marked Done (database update 0015; missing before that). */
  repeat_rule?: RepeatRule | null;
  repeat_until?: string | null;
  /** Internal (team-only) task: hidden from clients, Gantt exports and progress (database update 0016). */
  is_internal?: boolean;
  /** Variation (client change) — database update 0030; missing before that. */
  variation_no?: number | null;
  variation_of?: string | null;
  variation_reason?: string | null;
  variation_requested_by?: string | null;
  variation_requested_on?: string | null;
  variation_approval?: VariationApproval | null;
  has_description: boolean;
  assignees: string[];
  blocked_by: string[];
  checklist_total: number;
  checklist_done: number;
  comment_count: number;
  attachment_count: number;
};

export type Member = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: AppRole | null;
  /** Resolved (signed) avatar URL, added on the server. */
  avatar_src?: string | null;
};

export type Milestone = { id: string; project_id: string; title: string; description: string | null; date: string; color: string };

export type Project = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  client_id: string | null;
  client: { id: string; name: string } | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  color: string;
  is_template: boolean;
  hidden_columns: string[];
  created_at: string;
};

export type Board = {
  project: Project;
  labels: StatusLabel[];
  columns: CustomColumn[];
  groups: Group[];
  tasks: BoardTask[];
  members: Member[];
  milestones: Milestone[];
};

export type ProjectSummary = Project & {
  health: { level: "red" | "amber" | "green"; red: number; amber: number; open: number; past_end: boolean } | null;
  task_count: number;
  done_count: number;
  overdue_count: number;
  avg_progress: number;
  member_ids: string[];
};

export type MyTask = {
  id: string;
  title: string;
  project_id: string;
  group_id: string;
  status_id: string | null;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  completed_at: string | null;
  project: { name: string; color: string };
  status: { name: string; color: string; is_done: boolean } | null;
  group: { name: string };
};

type Person = { first_name: string | null; last_name: string | null; email: string | null; avatar_url?: string | null };

export type TaskDetail = {
  task: BoardTask & { description: string | null; internal_notes: string | null; created_by: string | null };
  checklist: { id: string; task_id: string; title: string; is_done: boolean; position: number }[];
  comments: { id: string; task_id: string; author_id: string; body: string; created_at: string; edited_at: string | null; author: Person }[];
  attachments: { id: string; task_id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null; uploaded_by: string | null; created_at: string }[];
  blocked_by: { id: string; title: string; due_date: string | null; completed_at: string | null }[];
  blocking: { id: string; title: string }[];
  activity: { id: number; action: string; changes: Record<string, [unknown, unknown]>; created_at: string; actor_id: string | null; actor: Person }[];
};

export type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  logo_path: string | null;
};
