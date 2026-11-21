"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getTaskDetail, updateTask, type Result } from "@/app/(app)/projects/actions";
import { EMPTY_FILTERS, type BoardFilters } from "@/lib/board";
import { taskRisk, type Risk } from "@/lib/health";
import type { Board, BoardTask, Member, StatusLabel, TaskDetail } from "@/types/board";
import type { AppRole } from "@/types/database";

export type BoardPerms = {
  /** Can create/update tasks (managers, or technicians who are members). */
  canEdit: boolean;
  /** Managers and admins: groups, people, dependencies, settings, delete tasks. */
  canManage: boolean;
  /** Only the user themself may be (un)assigned by technicians. */
  meId: string;
  role: AppRole;
};

type Ctx = {
  board: Board;
  tasks: BoardTask[];
  byId: Map<string, BoardTask>;
  labelsById: Map<string, StatusLabel>;
  membersById: Map<string, Member>;
  /** Delay warnings per task (see src/lib/health.ts). */
  risks: Map<string, Risk>;
  perms: BoardPerms;
  filters: BoardFilters;
  setFilters: (f: BoardFilters) => void;
  /** Optimistically changes a task on screen, then saves it. Reverts and shows an error if saving fails. */
  patchTask: (id: string, patch: Partial<BoardTask>) => Promise<boolean>;
  openTaskId: string | null;
  openTask: (id: string | null) => void;
  loadTaskDetail: (id: string) => Promise<Result<TaskDetail>>;
};

const BoardContext = createContext<Ctx | null>(null);

export function useBoard() {
  const ctx = use(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside <BoardProvider>");
  return ctx;
}

/** Fields the server accepts in a task update (BoardTask also has computed fields). */
const SAVABLE = ["title", "status_id", "priority", "start_date", "due_date", "progress", "group_id", "custom_values", "repeat_rule", "repeat_until"] as const;

export function BoardProvider({
  board,
  perms,
  children,
  loadTaskDetail = getTaskDetail,
}: {
  board: Board;
  perms: BoardPerms;
  children: React.ReactNode;
  /** Overridable for the development preview, which has no database. */
  loadTaskDetail?: (id: string) => Promise<Result<TaskDetail>>;
}) {
  const [tasks, setTasks] = useState(board.tasks);
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openTaskId = params.get("task");

  // Fresh data from the server (after a save or a live update) replaces local state.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing server props into optimistic local state
  useEffect(() => setTasks(board.tasks), [board.tasks]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const labelsById = useMemo(() => new Map(board.labels.map((l) => [l.id, l])), [board.labels]);
  const membersById = useMemo(() => new Map(board.members.map((m) => [m.user_id, m])), [board.members]);
  const risks = useMemo(() => new Map(tasks.map((t) => [t.id, taskRisk(t, byId)])), [tasks, byId]);

  const patchTask = useCallback(
    async (id: string, patch: Partial<BoardTask>) => {
      const before = tasks.find((t) => t.id === id);
      if (!before) return false;
      const optimistic: Partial<BoardTask> = { ...patch };
      if (patch.status_id !== undefined) {
        const done = patch.status_id ? labelsById.get(patch.status_id)?.is_done : false;
        optimistic.completed_at = done ? (before.completed_at ?? new Date().toISOString()) : null;
        if (done) optimistic.progress = 100;
      }
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...optimistic } : t)));

      const toSave = Object.fromEntries(Object.entries(patch).filter(([k]) => (SAVABLE as readonly string[]).includes(k)));
      const res = await updateTask(id, toSave);
      if (!res.ok) {
        setTasks((ts) => ts.map((t) => (t.id === id ? before : t)));
        toast.error(res.error);
        return false;
      }
      if (optimistic.completed_at && !before.completed_at && before.repeat_rule) {
        const ended = before.repeat_until && (before.due_date ?? before.start_date ?? "") >= before.repeat_until;
        toast.success(ended ? "Done — that was the last one in this repeating series." : "🔁 Done — the next one has been added to the board.");
      }
      // The server action revalidates the page, so fresh data arrives automatically.
      return true;
    },
    [tasks, labelsById],
  );

  const openTask = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("task", id);
      else next.delete("task");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const value = useMemo(
    () => ({ board, tasks, byId, labelsById, membersById, risks, perms, filters, setFilters, patchTask, openTaskId, openTask, loadTaskDetail }),
    [board, tasks, byId, labelsById, membersById, risks, perms, filters, patchTask, openTaskId, openTask, loadTaskDetail],
  );
  return <BoardContext value={value}>{children}</BoardContext>;
}
