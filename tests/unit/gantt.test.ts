import { describe, expect, it } from "vitest";
import { applyDrag, autoZoom, daysBetween, ellipsize, layoutGantt, shiftDate, taskSpan, type GanttInput } from "@/lib/gantt/layout";

const input: GanttInput = {
  groups: [
    { id: "g1", name: "Planning", color: "#111111" },
    { id: "g2", name: "Build", color: "#222222" },
  ],
  labels: [
    { id: "s1", name: "Working", color: "#f59e0b", is_done: false },
    { id: "s2", name: "Done", color: "#22c55e", is_done: true },
  ],
  milestones: [{ id: "m1", title: "Handover", date: "2026-03-20", color: "#7c3aed" }],
  tasks: [
    { id: "a", title: "Survey", group_id: "g1", status_id: "s2", start_date: "2026-03-02", due_date: "2026-03-04", progress: 100, completed_at: "x", blocked_by: [] },
    { id: "b", title: "Walls", group_id: "g2", status_id: "s1", start_date: "2026-03-05", due_date: "2026-03-10", progress: 50, completed_at: null, blocked_by: ["a"] },
    { id: "c", title: "Paint", group_id: "g2", status_id: null, start_date: "2026-03-08", due_date: "2026-03-12", progress: 0, completed_at: null, blocked_by: ["b"] },
    { id: "d", title: "No dates", group_id: "g2", status_id: null, start_date: null, due_date: null, progress: 0, completed_at: null, blocked_by: [] },
  ],
};

describe("date helpers", () => {
  it("counts and shifts whole days across months and leap years", () => {
    expect(daysBetween("2028-02-27", "2028-03-01")).toBe(3);
    expect(shiftDate("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("turns a single date into a one-day span and fixes reversed dates", () => {
    expect(taskSpan({ start_date: null, due_date: "2026-03-05" })).toEqual({ start: "2026-03-05", end: "2026-03-05" });
    expect(taskSpan({ start_date: "2026-03-09", due_date: "2026-03-05" })).toEqual({ start: "2026-03-05", end: "2026-03-09" });
    expect(taskSpan({ start_date: null, due_date: null })).toBeNull();
  });
});

describe("layoutGantt", () => {
  const layout = layoutGantt(input, { zoom: "day", colorBy: "status", today: "2026-03-06" });

  it("covers all dates with padding and places today", () => {
    expect(layout.start).toBe("2026-02-27");
    expect(layout.end).toBe("2026-03-23");
    expect(layout.todayX).toBe(daysBetween(layout.start, "2026-03-06") * 36 + 18);
  });

  it("lays out milestone row, group headers and task rows in order", () => {
    expect(layout.rows.map((r) => (r.kind === "task" ? r.task.id : r.kind === "group" ? `[${r.group.name}]` : "◆"))).toEqual([
      "◆", "[Planning]", "a", "[Build]", "b", "c", "d",
    ]);
  });

  it("sizes bars by inclusive days and colours them by status", () => {
    const b = layout.rows.find((r) => r.kind === "task" && r.task.id === "b");
    expect(b?.kind === "task" && b.bar).toMatchObject({ x: daysBetween("2026-02-27", "2026-03-05") * 36, width: 6 * 36 });
    expect(b?.kind === "task" && b.color).toBe("#f59e0b");
    const d = layout.rows.find((r) => r.kind === "task" && r.task.id === "d");
    expect(d?.kind === "task" && d.bar).toBeNull();
  });

  it("draws dependency arrows and flags overlaps as late", () => {
    expect(layout.deps.map((d) => [d.from, d.to, d.late])).toEqual([
      ["a", "b", false],
      ["b", "c", true],
    ]);
  });

  it("can colour by group, with a matching legend", () => {
    const g = layoutGantt(input, { zoom: "week", colorBy: "group", today: "2026-03-06" });
    const b = g.rows.find((r) => r.kind === "task" && r.task.id === "b");
    expect(b?.kind === "task" && b.color).toBe("#222222");
    expect(g.legend.map((l) => l.label)).toEqual(["Planning", "Build"]);
    expect(new Date(`${g.start}T00:00:00Z`).getUTCDay()).toBe(1); // week view starts on Monday
  });

  it("month zoom starts on the 1st and labels months", () => {
    const m = layoutGantt(input, { zoom: "month", colorBy: "status", today: "2026-03-06" });
    expect(m.start.endsWith("-01")).toBe(true);
    expect(m.bottomTicks.map((t) => t.label)).toContain("Mar");
  });
});

describe("dragging and helpers", () => {
  const span = { start: "2026-03-05", end: "2026-03-10" };
  it("moves and resizes without inverting the bar", () => {
    expect(applyDrag(span, "move", 2)).toEqual({ start: "2026-03-07", end: "2026-03-12" });
    expect(applyDrag(span, "end", -1)).toEqual({ start: "2026-03-05", end: "2026-03-09" });
    expect(applyDrag(span, "start", 20)).toEqual({ start: "2026-03-10", end: "2026-03-10" });
  });
  it("picks a zoom that fits", () => {
    expect(autoZoom(input, "2026-03-06")).toBe("day");
    const long = { ...input, milestones: [{ id: "m", title: "x", date: "2027-06-01", color: "#000000" }] };
    expect(autoZoom(long, "2026-03-06")).toBe("month");
  });
  it("shortens long titles", () => {
    expect(ellipsize("Electrical first fix", 10)).toBe("Electrica…");
    expect(ellipsize("Paint", 10)).toBe("Paint");
  });
});

describe("milestone labels never overlap", () => {
  it("moves colliding labels to a second line or the left, and merges same-day milestones", async () => {
    const { placeMilestoneLabels, LABEL_CHAR_W } = await import("@/lib/gantt/layout");
    const ms = [
      { id: "a", title: "Floor 6 complete", date: "2027-02-24", x: 600 },
      { id: "b", title: "Penthouses complete", date: "2027-03-10", x: 640 },
      { id: "c", title: "Maisonettes complete", date: "2027-03-26", x: 700 },
      { id: "d", title: "Practical completion – M&E", date: "2027-03-26", x: 700 },
    ];
    const { labels, twoLines } = placeMilestoneLabels(ms, 760);
    expect(twoLines).toBe(true);
    // Same day → one shared label.
    expect(labels.find((l) => l.ids.includes("c"))!.ids).toEqual(["c", "d"]);
    // No two labels on the same line overlap, and none run off the chart.
    const boxes = labels.map((l) => {
      const w = l.text.length * LABEL_CHAR_W;
      const a = l.anchor === "start" ? l.x : l.x - w;
      return { line: l.line, a, b: a + w };
    });
    for (const p of boxes) {
      expect(p.a).toBeGreaterThanOrEqual(0);
      expect(p.b).toBeLessThanOrEqual(760);
      for (const q of boxes) if (p !== q && p.line === q.line) expect(p.b <= q.a || q.b <= p.a).toBe(true);
    }
  });
});
