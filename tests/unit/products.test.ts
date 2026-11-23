import { describe, expect, it } from "vitest";
import { parseProductLines } from "@/lib/products";

describe("pasting a product list from Excel", () => {
  it("reads tab-separated rows, skips a header row and fills in a default unit", () => {
    const text = "Name\tUnit\tCategory\tCode\nPlasterboard 12.5mm\tsheets\tDrylining\t\nTwin & earth 2.5mm\trolls\tElectrical\tTE25\nCable ties\n\n";
    expect(parseProductLines(text)).toEqual([
      { name: "Plasterboard 12.5mm", unit: "sheets", category: "Drylining", code: null },
      { name: "Twin & earth 2.5mm", unit: "rolls", category: "Electrical", code: "TE25" },
      { name: "Cable ties", unit: "pcs", category: null, code: null },
    ]);
  });

  it("reads CSV rows, including quoted names with commas", () => {
    expect(parseProductLines('"Screws 4x40, zinc",boxes,Fixings\nGrout,bags')).toEqual([
      { name: "Screws 4x40, zinc", unit: "boxes", category: "Fixings", code: null },
      { name: "Grout", unit: "bags", category: null, code: null },
    ]);
  });
});
