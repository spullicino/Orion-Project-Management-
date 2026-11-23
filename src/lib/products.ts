/** Splits lines pasted from Excel (tabs) or a CSV (commas): Name, Unit, Category, Code. */
export function parseProductLines(text: string): { name: string; unit: string; category: string | null; code: string | null }[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((c) => c.replace(/^"|"$/g, "").trim()));
  if (rows.length && /^(name|product|item)$/i.test(rows[0][0] ?? "")) rows.shift(); // header row
  return rows
    .filter((r) => r[0])
    .map((r) => ({ name: r[0].slice(0, 200), unit: (r[1] || "pcs").slice(0, 20), category: r[2] ? r[2].slice(0, 60) : null, code: r[3] ? r[3].slice(0, 60) : null }));
}
