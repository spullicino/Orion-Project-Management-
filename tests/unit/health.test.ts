import { describe, expect, it } from "vitest";
import { projectHealth, taskRisk } from "@/lib/health";

const TODAY = "2026-03-10";
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: id, start_date: null, due_date: null, progress: 0, completed_at: null, blocked_by: [] as string[], priority: "medium" as const, ...extra,
});

describe("taskRisk (same rules as app.task_risk in SQL)", () => {
  const byId = (...ts: ReturnType<typeof task>[]) => new Map(ts.map((t) => [t.id, t]));

  it("overdue is red; finished tasks never warn", () => {
    const t = task("a", { due_date: "2026-03-09" });
    expect(taskRisk(t, byId(t), TODAY)).toEqual({ level: "red", reason: "Overdue" });
    expect(taskRisk({ ...t, completed_at: "x" }, byId(t), TODAY)).toBeNull();
  });

  it("waiting for a late task is red; waiting for an open task about to start is amber", () => {
    const late = task("late", { due_date: "2026-03-08" });
    const open = task("open", { due_date: "2026-03-20" });
    expect(taskRisk(task("b", { blocked_by: ["late"], start_date: "2026-04-01" }), byId(late), TODAY)?.level).toBe("red");
    expect(taskRisk(task("c", { blocked_by: ["open"], start_date: "2026-03-12" }), byId(open), TODAY)).toEqual({ level: "amber", reason: "Waiting for: open" });
    expect(taskRisk(task("d", { blocked_by: ["open"], start_date: "2026-03-20" }), byId(open), TODAY)).toBeNull();
  });

  it("due soon with little progress, or behind schedule, is amber", () => {
    expect(taskRisk(task("e", { due_date: "2026-03-12", progress: 20 }), new Map(), TODAY)?.reason).toBe("Due soon with little progress");
    expect(taskRisk(task("f", { due_date: "2026-03-12", progress: 60 }), new Map(), TODAY)).toBeNull();
    // 78 % of the time gone, only 30 % done → behind (below)
    expect(taskRisk(task("g", { start_date: "2026-03-02", due_date: "2026-03-20", progress: 20 }), new Map(), TODAY)).toBeNull(); // 44 % of the time gone, 20 % done: fine
    expect(taskRisk(task("h", { start_date: "2026-02-20", due_date: "2026-03-15", progress: 30 }), new Map(), TODAY)?.reason).toBe("Behind schedule");
  });
});

describe("projectHealth (same rules as app.project_health in SQL)", () => {
  it("green, amber and red", () => {
    expect(projectHealth([task("a", { due_date: "2026-04-01" })], null, TODAY).level).toBe("green");
    expect(projectHealth([task("a", { due_date: "2026-03-09" }), task("b"), task("c"), task("d"), task("e"), task("f")], null, TODAY).level).toBe("amber");
    expect(projectHealth([task("a", { due_date: "2026-03-09", priority: "critical" })], null, TODAY).level).toBe("red");
    expect(projectHealth([task("a", { due_date: "2026-03-09" }), task("b", { due_date: "2026-03-01" }), task("c")], null, TODAY).level).toBe("red");
    expect(projectHealth([task("a")], "2026-03-01", TODAY)).toMatchObject({ level: "red", past_end: true });
  });
});
