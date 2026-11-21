import { describe, expect, it } from "vitest";
import { hasRole } from "@/lib/auth/roles";
import { HELP_TOPICS } from "@/lib/help";
import { hasUnseen, isNewEntry, newerSeen, WHATS_NEW, whatsNewFor } from "@/lib/whats-new";

describe("what's new", () => {
  it("entries are unique, newest first, and their ids start with their date", () => {
    const ids = WHATS_NEW.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const dates = WHATS_NEW.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const e of WHATS_NEW) expect(e.id.startsWith(`${e.date}-`)).toBe(true);
    expect(WHATS_NEW.at(-1)!.id).toMatch(/launch/);
  });

  it("help links point at real help topics", () => {
    const topics = new Set(HELP_TOPICS.map((t) => t.id));
    for (const e of WHATS_NEW.filter((x) => x.help && x.help !== "/help")) expect(topics.has(e.help!.split("#")[1])).toBe(true);
  });

  it("red dot only when something newer than the last seen entry exists", () => {
    const entries = whatsNewFor("technician", hasRole);
    expect(hasUnseen(entries, null)).toBe(true);
    expect(hasUnseen(entries, entries[0].id)).toBe(false);
    expect(hasUnseen(entries, entries[1].id)).toBe(true);
    expect(isNewEntry(entries, entries[2].id, 1)).toBe(true);
    expect(isNewEntry(entries, entries[2].id, 3)).toBe(false);
    expect(newerSeen(entries, entries[3].id, entries[1].id)).toBe(entries[1].id);
  });

  it("admin-only entries are hidden from other levels", () => {
    expect(whatsNewFor("technician", hasRole).some((e) => e.minRole === "admin")).toBe(false);
    expect(whatsNewFor("admin", hasRole).some((e) => e.minRole === "admin")).toBe(true);
  });
});
