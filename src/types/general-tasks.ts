import type { Priority } from "./board";

export type GeneralStatus = "not_started" | "working" | "waiting" | "done";

export const GENERAL_STATUSES: { value: GeneralStatus; label: string; color: string }[] = [
  { value: "not_started", label: "Not started", color: "#94a3b8" },
  { value: "working", label: "Working on it", color: "#f59e0b" },
  { value: "waiting", label: "Waiting", color: "#8b5cf6" },
  { value: "done", label: "Done", color: "#22c55e" },
];

export type ChecklistItem = { text: string; done: boolean };

export type GeneralTaskPerson = { id: string; first_name: string | null; last_name: string | null; email: string | null; avatar_url?: string | null };

/** A task not linked to any project (database update 0026). */
export type GeneralTask = {
  id: string;
  title: string;
  description: string | null;
  status: GeneralStatus;
  priority: Priority;
  due_date: string | null;
  checklist: ChecklistItem[];
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
  creator_name: string;
  client: { id: string; name: string } | null;
  assignees: GeneralTaskPerson[];
  comment_count: number;
};

export type GeneralTaskComment = { id: string; body: string; created_at: string; author_id: string | null; author_name: string };
