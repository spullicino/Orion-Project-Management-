"use client";

// Development-only: renders the board with sample data and fake task details.
import { BoardProvider } from "@/components/board/board-context";
import { BoardView } from "@/components/board/board-view";
import { KanbanView } from "@/components/board/kanban-view";
import { TaskDrawer } from "@/components/board/task-drawer";
import { CalendarView } from "@/components/calendar/calendar-view";
import { GanttView } from "@/components/gantt/gantt-view";
import { ProjectDashboard } from "@/components/dashboard/project-dashboard";
import type { TaskDetail } from "@/types/board";
import { previewBoard } from "./fixtures";

async function fakeDetail(id: string) {
  const task = previewBoard.tasks.find((t) => t.id === id)!;
  const person = { first_name: "Tina", last_name: "Camilleri", email: "tech1@orion.test" };
  const detail: TaskDetail = {
    task: { ...task, description: "Stud framing 70mm, double board both sides.\nCheck door positions against drawing A-102.", internal_notes: null, created_by: "u2" },
    checklist: [
      { id: "c1", task_id: id, title: "Order cable trays", is_done: true, position: 1 },
      { id: "c2", task_id: id, title: "Confirm DB board location", is_done: false, position: 2 },
    ],
    comments: [{ id: "m1", task_id: id, author_id: "u3", body: "Waiting on landlord permit before chasing walls.", created_at: new Date(Date.now() - 3600e3).toISOString(), edited_at: null, author: person }],
    attachments: [{ id: "a1", task_id: id, storage_path: "x", file_name: "Drawing-A-102.pdf", mime_type: "application/pdf", size_bytes: 284000, uploaded_by: "u2", created_at: new Date().toISOString() }],
    blocked_by: task.blocked_by.map((b) => ({ id: b, title: previewBoard.tasks.find((t) => t.id === b)!.title, due_date: null, completed_at: null })),
    blocking: [],
    activity: [{ id: 1, action: "task.updated", changes: { status_id: ["l1", "l2"] }, created_at: new Date(Date.now() - 7200e3).toISOString(), actor_id: "u3", actor: person }],
  };
  return { ok: true as const, data: detail };
}

export function PreviewClient({ view, manager }: { view?: string; manager: boolean }) {
  return (
    <BoardProvider board={previewBoard} perms={{ canEdit: manager, canManage: manager, meId: "u3", role: manager ? "manager" : "basic" }} loadTaskDetail={fakeDetail}>
      {view === "dashboard" ? <ProjectDashboard diary={{ count: 6, people: 2, last: previewBoard.project.start_date }} /> : view === "kanban" ? <KanbanView /> : view === "gantt" ? <GanttView /> : view === "calendar" ? <CalendarView /> : <BoardView />}
      <TaskDrawer />
    </BoardProvider>
  );
}
