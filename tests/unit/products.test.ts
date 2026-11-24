import { describe, expect, it } from "vitest";
import { parseProductLines, rowsToProducts } from "@/lib/products";

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

describe("reading a product list from an Excel file", () => {
  it("matches columns by their header titles in any order and ignores extra columns", () => {
    const rows = [
      [null, null, null],
      ["Code", "Product", "Notes", "Unit", "Category"],
      ["TE25", "Twin & earth 2.5mm", "x", "rolls", "Electrical"],
      [null, "Grout", null, null, null],
      [12, null, null, "pcs", null],
    ];
    expect(rowsToProducts(rows)).toEqual([
      { name: "Twin & earth 2.5mm", unit: "rolls", category: "Electrical", code: "TE25" },
      { name: "Grout", unit: "pcs", category: null, code: null },
    ]);
  });

  it("uses Name, Unit, Category, Code order when there is no header, and turns numbers into text", () => {
    expect(rowsToProducts([["Pipe 22mm", "lengths", "Plumbing", 1022]])).toEqual([{ name: "Pipe 22mm", unit: "lengths", category: "Plumbing", code: "1022" }]);
  });
});
