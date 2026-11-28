import { describe, expect, it } from "vitest";
import { moveCard, normalizeLayout, type HomeCardId } from "@/lib/home-layout";

const all: HomeCardId[] = ["daily", "materials", "tasks", "tickets", "attention", "shortcuts"];

describe("Home layout", () => {
  it("no saved layout = the standard order", () => {
    expect(normalizeLayout(undefined, all)).toEqual({ order: all, hidden: [] });
    expect(normalizeLayout(null, ["tasks", "shortcuts"]).order).toEqual(["tasks", "shortcuts"]);
  });
  it("keeps the person's order, drops unknown or unavailable cards and duplicates", () => {
    const l = normalizeLayout({ order: ["tasks", "tasks", "bogus", "shortcuts", "daily"], hidden: ["attention", "nope"] }, ["tasks", "shortcuts", "daily", "attention"]);
    // "attention" wasn't in their saved order: it goes after My Tasks, as in the standard Home.
    expect(l.order).toEqual(["tasks", "attention", "shortcuts", "daily"]);
    expect(l.hidden).toEqual(["attention"]);
  });
  it("a card that's new for them appears where it would by default", () => {
    // They saved before getting Aftersales: tickets slots in after My Tasks.
    const l = normalizeLayout({ order: ["tasks", "daily", "materials", "shortcuts"], hidden: [] }, all);
    expect(l.order.indexOf("tickets")).toBe(l.order.indexOf("tasks") + 1);
    expect(l.order).toHaveLength(6);
  });
  it("moves a card", () => {
    expect(moveCard(["a", "b", "c"] as unknown as HomeCardId[], "c" as HomeCardId, 0)).toEqual(["c", "a", "b"]);
    expect(moveCard(["daily", "tasks", "shortcuts"], "daily", 2)).toEqual(["tasks", "shortcuts", "daily"]);
    expect(moveCard(["daily", "tasks"], "tasks", -5)).toEqual(["tasks", "daily"]);
  });
});
