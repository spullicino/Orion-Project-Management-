import { describe, expect, it } from "vitest";
import { HELP_TOPICS } from "@/lib/help";

describe("help guides", () => {
  it("have unique topic ids, steps and balanced bold markers", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of HELP_TOPICS) {
      expect(t.guides.length).toBeGreaterThan(0);
      for (const g of t.guides) {
        expect(g.steps.length).toBeGreaterThan(0);
        for (const s of [...g.steps, g.tip ?? ""]) expect((s.match(/\*\*/g) ?? []).length % 2).toBe(0);
      }
    }
  });

  it("covers every main part of the app", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    for (const id of ["projects", "tasks", "my-tasks", "gantt", "daily-update", "chats", "personal", "notifications", "admin"]) expect(ids).toContain(id);
  });
});
