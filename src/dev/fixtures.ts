// Sample data for the development-only preview page (/dev/board-preview). Not used in production.
import { addDays, todayISO } from "@/lib/board";
import type { Board, BoardTask } from "@/types/board";

const P = "20000000-0000-4000-8000-000000000001";
const d = (n: number) => addDays(todayISO(), n);
const labels = [
  { id: "l1", project_id: P, name: "Not started", color: "#94a3b8", position: 0, is_done: false },
  { id: "l2", project_id: P, name: "Working on it", color: "#f59e0b", position: 1, is_done: false },
  { id: "l3", project_id: P, name: "Stuck", color: "#ef4444", position: 2, is_done: false },
  { id: "l4", project_id: P, name: "Done", color: "#22c55e", position: 3, is_done: true },
];
const groups = [
  { id: "g1", project_id: P, name: "Planning", color: "#6366f1", position: 1, collapsed: false },
  { id: "g2", project_id: P, name: "In progress", color: "#f59e0b", position: 2, collapsed: false },
  { id: "g3", project_id: P, name: "Done", color: "#22c55e", position: 3, collapsed: false },
];
const base = {
  project_id: P,
  custom_values: {},
  created_at: d(-30),
  updated_at: d(-1),
  has_description: false,
  checklist_total: 0,
  checklist_done: 0,
  comment_count: 0,
  attachment_count: 0,
  blocked_by: [] as string[],
};
const t = (id: string, group_id: string, title: string, status_id: string, extra: Partial<BoardTask>): BoardTask => ({
  ...base,
  id,
  group_id,
  title,
  status_id,
  priority: "medium",
  start_date: null,
  due_date: null,
  progress: 0,
  position: 1,
  completed_at: status_id === "l4" ? d(-2) : null,
  assignees: [],
  ...extra,
});

export const previewBoard: Board = {
  project: {
    id: P,
    name: "Valletta Office Fit-out",
    code: "VAL-001",
    description: null,
    // No client id here: the preview has no database to fetch a client logo from.
    client_id: null,
    client: { id: "c1", name: "Harbour Holdings Ltd" },
    status: "active",
    start_date: d(-21),
    end_date: d(40),
    color: "#2d57a3",
    is_template: false,
    hidden_columns: [],
    created_at: d(-30),
  },
  labels,
  columns: [{ id: "col1", project_id: P, name: "Room", kind: "text", position: 0 }],
  groups,
  tasks: [
    t("t1", "g1", "Site survey & measurements", "l4", { start_date: d(-21), due_date: d(-18), progress: 100, assignees: ["u2"] }),
    t("t2", "g1", "Layout approval with client", "l4", { start_date: d(-17), due_date: d(-12), progress: 100, assignees: ["u2"], comment_count: 3 }),
    t("t3", "g2", "Partition walls", "l2", { start_date: d(-10), due_date: d(3), progress: 60, assignees: ["u3"], priority: "high", checklist_total: 4, checklist_done: 2, custom_values: { col1: "Meeting room 2" } }),
    t("t4", "g2", "Electrical first fix", "l3", { start_date: d(-5), due_date: d(-1), progress: 20, assignees: ["u3", "u2"], priority: "critical", comment_count: 2, attachment_count: 1 }),
    t("t5", "g2", "Data cabling", "l1", { start_date: d(3), due_date: d(14), assignees: ["u3"], blocked_by: ["t4"] }),
    t("t6", "g3", "Painting & finishes", "l1", { start_date: d(15), due_date: d(35), priority: "low", blocked_by: ["t3"] }),
  ],
  members: [
    { user_id: "u2", first_name: "Mark", last_name: "Borg", email: "manager@orion.test", avatar_url: null, role: "manager", avatar_src: null },
    { user_id: "u3", first_name: "Tina", last_name: "Camilleri", email: "tech1@orion.test", avatar_url: null, role: "technician", avatar_src: null },
    { user_id: "u5", first_name: "Ben", last_name: "Ellul", email: "basic@orion.test", avatar_url: null, role: "basic", avatar_src: null },
  ],
  milestones: [
    { id: "m1", project_id: P, title: "Client walkthrough", description: null, date: d(10), color: "#7c3aed" },
    { id: "m2", project_id: P, title: "Handover", description: null, date: d(40), color: "#0584c7" },
  ],
};
