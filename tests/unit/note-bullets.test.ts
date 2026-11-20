import { describe, expect, it } from "vitest";
import { autoBullet, enterInBullet, toggleBullets } from "@/lib/note-bullets";

describe("note bullet lists", () => {
  it("turns selected lines into bullets and back", () => {
    const text = "Intro\nEggs\nMilk\nEnd";
    const on = toggleBullets(text, 6, 15); // "Eggs\nMilk"
    expect(on.text).toBe("Intro\n• Eggs\n• Milk\nEnd");
    const off = toggleBullets(on.text, on.start, on.end);
    expect(off.text).toBe(text);
  });

  it("bullets the current line when nothing is selected and keeps the cursor in place", () => {
    const r = toggleBullets("Buy tiles", 3, 3);
    expect(r).toEqual({ text: "• Buy tiles", start: 5, end: 5 });
    expect(toggleBullets("", 0, 0)).toEqual({ text: "• ", start: 2, end: 2 });
  });

  it("continues a list on Enter and ends it on an empty bullet", () => {
    const r = enterInBullet("• Eggs", 6, 6)!;
    expect(r).toEqual({ text: "• Eggs\n• ", start: 9, end: 9 });
    const stop = enterInBullet(r.text, r.start, r.end)!;
    expect(stop.text).toBe("• Eggs\n");
    expect(enterInBullet("Plain line", 5, 5)).toBeNull();
  });

  it("turns '- ' at the start of a line into a bullet", () => {
    expect(autoBullet("Notes\n- ", 8)).toEqual({ text: "Notes\n• ", start: 8, end: 8 });
    expect(autoBullet("a - ", 4)).toBeNull();
  });
});
