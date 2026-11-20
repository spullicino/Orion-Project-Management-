import { describe, expect, it } from "vitest";
import { addDays, blockingTasks, bucketMyTasks, describeChange, dueState, EMPTY_FILTERS, filterTasks, shortDate } from "@/lib/board";
import type { MyTask } from "@/types/board";

const TODAY = "2026-03-10";

describe("dates", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-02-27", 3)).toBe("2026-03-02");
    expect(addDays(TODAY, -10)).toBe("2026-02-28");
  });

  it("classifies due dates", () => {
    expect(dueState("2026-03-09", false, TODAY)).toBe("overdue");
    expect(dueState(TODAY, false, TODAY)).toBe("today");
    expect(dueState("2026-03-13", false, TODAY)).toBe("soon");
    expect(dueState("2026-03-14", false, TODAY)).toBe("later");
    expect(dueState(null, false, TODAY)).toBe("none");
    expect(dueState("2026-03-01", true, TODAY)).toBe("done");
  });

  it("formats short dates, adding the year only when different", () => {
    expect(shortDate("2026-03-05", TODAY)).toBe("5 Mar");
    expect(shortDate("2027-01-02", TODAY)).toBe("2 Jan 2027");
  });
});

describe("filterTasks", () => {
  const tasks = [
    { title: "Paint walls", assignees: ["me"], status_id: "s1", due_date: "2026-03-01", completed_at: null },
    { title: "Order cable", assignees: ["you"], status_id: "s2", due_date: "2026-03-12", completed_at: null },
    { title: "Survey", assignees: [], status_id: "s3", due_date: null, completed_at: "2026-03-01T10:00:00Z" },
  ];
  const titles = (f: Partial<typeof EMPTY_FILTERS>) => filterTasks(tasks, { ...EMPTY_FILTERS, ...f }, "me", TODAY).map((t) => t.title);

  it("filters by text, person, status and due date", () => {
    expect(titles({})).toHaveLength(3);
    expect(titles({ text: "CABLE" })).toEqual(["Order cable"]);
    expect(titles({ person: "me" })).toEqual(["Paint walls"]);
    expect(titles({ person: "none" })).toEqual(["Survey"]);
    expect(titles({ person: "you" })).toEqual(["Order cable"]);
    expect(titles({ status: "open" })).toEqual(["Paint walls", "Order cable"]);
    expect(titles({ status: "s3" })).toEqual(["Survey"]);
    expect(titles({ due: "overdue" })).toEqual(["Paint walls"]);
    expect(titles({ due: "week" })).toEqual(["Paint walls", "Order cable"]);
    expect(titles({ due: "none" })).toEqual(["Survey"]);
  });
});

describe("blockingTasks", () => {
  it("lists unfinished tasks this one waits for", () => {
    const byId = new Map([
      ["a", { id: "a", title: "A", completed_at: null }],
      ["b", { id: "b", title: "B", completed_at: "2026-01-01" }],
    ]);
    expect(blockingTasks({ blocked_by: ["a", "b", "gone"] }, byId).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("bucketMyTasks", () => {
  const t = (id: string, due: string | null, done = false) =>
    ({ id, title: id, due_date: due, completed_at: done ? "x" : null }) as unknown as MyTask;
  it("puts each task in the right bucket and drops empty ones", () => {
    const buckets = bucketMyTasks([t("late", "2026-03-01"), t("now", TODAY), t("soon", "2026-03-15"), t("far", "2026-05-01"), t("open", null), t("fin", "2026-03-01", true)], TODAY);
    expect(buckets.map((b) => [b.key, b.tasks.map((x) => x.id)])).toEqual([
      ["overdue", ["late"]],
      ["today", ["now"]],
      ["week", ["soon"]],
      ["later", ["far"]],
      ["none", ["open"]],
      ["done", ["fin"]],
    ]);
    expect(bucketMyTasks([t("open", null)], TODAY).map((b) => b.key)).toEqual(["none"]);
  });
});

describe("describeChange", () => {
  const lookup = { status: (id: string) => ({ s1: "Not started", s2: "Done" })[id], group: () => "Planning" };
  it("writes activity in plain language", () => {
    expect(describeChange("status_id", ["s1", "s2"], lookup)).toBe("changed status from Not started to Done");
    expect(describeChange("progress", [10, 60], lookup)).toBe("updated progress to 60%");
    expect(describeChange("due_date", [null, "2026-03-05"], lookup)).toBe("set the due date to 5 Mar");
    expect(describeChange("status_id", ["s1", "zzz"], lookup)).toBe("changed status from Not started to a removed status");
  });
});
