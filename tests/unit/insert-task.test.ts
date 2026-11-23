import { describe, expect, it } from "vitest";
import { suggestDates } from "@/lib/board";

describe("suggested dates for an inserted task", () => {
  const anchor = { start_date: "2027-01-04", due_date: "2027-01-07" }; // 4 days long
  it("below: starts the day after, same length", () => {
    expect(suggestDates(anchor, "below")).toEqual({ start: "2027-01-08", due: "2027-01-11" });
  });
  it("above: ends the day before, same length", () => {
    expect(suggestDates(anchor, "above")).toEqual({ start: "2026-12-31", due: "2027-01-03" });
  });
  it("no dates on the task: no suggestion", () => {
    expect(suggestDates({ start_date: null, due_date: null }, "below")).toEqual({ start: "", due: "" });
  });
});
