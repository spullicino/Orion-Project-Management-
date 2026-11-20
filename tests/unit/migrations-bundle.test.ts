import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bundle } from "../../scripts/bundle-migrations.mjs";

describe("supabase/setup/all-in-one.sql", () => {
  it("is up to date with supabase/migrations (run `npm run db:bundle` if this fails)", () => {
    const current = readFileSync(path.resolve(import.meta.dirname, "../../supabase/setup/all-in-one.sql"), "utf8");
    expect(current).toBe(bundle());
  });
});
