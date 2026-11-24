export type ProductRow = { name: string; unit: string; category: string | null; code: string | null };

const HEADERS: Record<keyof ProductRow, RegExp> = {
  name: /^(name|product|product name|item|description)$/i,
  unit: /^(unit|units|uom)$/i,
  category: /^(category|group|type)$/i,
  code: /^(code|product code|item code|sku|ref|reference)$/i,
};

/**
 * Turns spreadsheet rows (from an .xlsx, CSV or pasted cells) into products.
 * If the first row is a header (e.g. "Name | Unit | Category | Code"), columns are matched by
 * their titles in any order; otherwise the order is Name, Unit, Category, Code.
 */
export function rowsToProducts(input: unknown[][]): ProductRow[] {
  const rows = input.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c).trim())));
  let col: Record<keyof ProductRow, number> = { name: 0, unit: 1, category: 2, code: 3 };
  const first = rows.findIndex((r) => r.some(Boolean));
  if (first >= 0 && rows[first].some((c) => HEADERS.name.test(c))) {
    const head = rows[first];
    const find = (k: keyof ProductRow) => head.findIndex((c) => HEADERS[k].test(c));
    col = { name: find("name"), unit: find("unit"), category: find("category"), code: find("code") };
    rows.splice(0, first + 1);
  }
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "") : "");
  return rows
    .filter((r) => at(r, col.name))
    .map((r) => ({
      name: at(r, col.name).slice(0, 200),
      unit: (at(r, col.unit) || "pcs").slice(0, 20),
      category: at(r, col.category) ? at(r, col.category).slice(0, 60) : null,
      code: at(r, col.code) ? at(r, col.code).slice(0, 60) : null,
    }));
}

/** Splits lines pasted from Excel (tabs) or a CSV (commas): Name, Unit, Category, Code. */
export function parseProductLines(text: string): ProductRow[] {
  const rows = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim()));
  return rowsToProducts(rows);
}
