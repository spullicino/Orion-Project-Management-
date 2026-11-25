import { describe, expect, it } from "vitest";
import { groupByProject } from "@/lib/materials/group";

const p = (id: string, name: string) => ({ id, name, color: "#000" });
const r = (n: number, project: ReturnType<typeof p>, urgent = false, late = false) => ({ number: n, project, urgent, late });

describe("material requests grouped by project", () => {
  it("puts projects with urgent or late requests first, then A–Z, keeping the order inside", () => {
    const solair = p("s", "OG5376 - Solair");
    const bank = p("b", "OG5698 - Central Bank");
    const embark = p("e", "OG5545 - Embark");
    const groups = groupByProject([r(14, solair), r(13, bank, false, true), r(12, solair, true), r(11, embark), r(10, solair)]);
    expect(groups.map((g) => [g.project.name, g.items.map((i) => i.number), g.urgent, g.late])).toEqual([
      ["OG5376 - Solair", [14, 12, 10], 1, 0],
      ["OG5698 - Central Bank", [13], 0, 1],
      ["OG5545 - Embark", [11], 0, 0],
    ]);
  });
});
