import { describe, expect, it } from "vitest";
import { hoursSummary, periodRange, updateRows } from "@/lib/diary/export-rows";
import type { DailyUpdate } from "@/types/diary";

const u = (id: string, author: [string, string], project: string, date: string, hours: number | null, extra: Partial<DailyUpdate> = {}): DailyUpdate => ({
  id,
  project_id: project,
  author_id: author[0],
  work_date: date,
  work_done: `Work ${id}`,
  hours,
  issues: null,
  created_at: `${date}T15:30:00Z`,
  updated_at: `${date}T15:30:00Z`,
  project: { id: project, name: project, color: "#000" },
  author: { first_name: author[1], last_name: "", email: null },
  photos: [],
  ...extra,
});

const joe: [string, string] = ["j", "Joe"];
const ann: [string, string] = ["a", "Ann"];
const list = [
  u("3", joe, "Solair", "2026-11-25", 8, { issues: "Rain" }),
  u("1", joe, "Embark", "2026-11-24", 4),
  u("2", ann, "Solair", "2026-11-24", null),
  u("4", joe, "Solair", "2026-11-24", 4.5),
];

describe("exporting daily updates", () => {
  it("lists one row per update, oldest day first, then person and project", () => {
    expect(updateRows(list).map((r) => [r.date, r.person, r.project, r.hours, r.issues, r.posted])).toEqual([
      ["2026-11-24", "Ann", "Solair", null, "", "16:30"],
      ["2026-11-24", "Joe", "Embark", 4, "", "16:30"],
      ["2026-11-24", "Joe", "Solair", 4.5, "", "16:30"],
      ["2026-11-25", "Joe", "Solair", 8, "Rain", "16:30"],
    ]);
  });

  it("adds up hours per person", () => {
    expect(hoursSummary(list)).toEqual([
      { person: "Joe", updates: 3, days: 2, hours: 16.5, projects: "Embark, Solair" },
      { person: "Ann", updates: 1, days: 1, hours: 0, projects: "Solair" },
    ]);
  });

  it("works out quick periods (weeks start on Monday)", () => {
    const today = "2026-11-25"; // Wednesday
    expect(periodRange("today", today)).toEqual({ from: today, to: today });
    expect(periodRange("yesterday", today)).toEqual({ from: "2026-11-24", to: "2026-11-24" });
    expect(periodRange("thisWeek", today)).toEqual({ from: "2026-11-23", to: today });
    expect(periodRange("lastWeek", today)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(periodRange("thisMonth", today)).toEqual({ from: "2026-11-01", to: today });
    expect(periodRange("lastMonth", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("thisWeek", "2026-11-29")).toEqual({ from: "2026-11-23", to: "2026-11-29" }); // Sunday
  });
});
