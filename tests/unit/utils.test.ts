import { describe, expect, it } from "vitest";
import { fieldErrors, formatDate, fullName, initials } from "@/lib/utils";

describe("utils", () => {
  it("builds names and initials with fallbacks", () => {
    expect(fullName({ first_name: "Ada", last_name: "Azzopardi" })).toBe("Ada Azzopardi");
    expect(fullName({ first_name: "", last_name: "", email: "x@y.z" })).toBe("x@y.z");
    expect(initials({ first_name: "ada", last_name: "azzopardi" })).toBe("AA");
    expect(initials({ email: "zed@y.z" })).toBe("Z");
  });

  it("formats dates as DD/MM/YYYY in Malta time", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Malta (UTC+1)
    expect(formatDate("2026-12-31T23:30:00Z")).toBe("01/01/2027");
  });

  it("keeps the first error per field", () => {
    expect(fieldErrors([{ path: ["email"], message: "a" }, { path: ["email"], message: "b" }, { path: [], message: "c" }])).toEqual({
      email: "a",
      form: "c",
    });
  });
});

import { normaliseSupabaseUrl } from "@/lib/env";

describe("normaliseSupabaseUrl", () => {
  it.each([
    ["https://abc.supabase.co", "https://abc.supabase.co"],
    ["https://abc.supabase.co/", "https://abc.supabase.co"],
    [" https://abc.supabase.co/rest/v1/ ", "https://abc.supabase.co"],
    ["", ""],
  ])("%s → %s", (input, expected) => expect(normaliseSupabaseUrl(input)).toBe(expected));
});

import { isMissingSchema } from "@/lib/data/db-errors";

describe("isMissingSchema", () => {
  it("recognises 'run the latest database update' errors", () => {
    expect(isMissingSchema({ code: "PGRST202", message: "Could not find the function public.get_my_tasks without parameters in the schema cache" })).toBe(true);
    expect(isMissingSchema({ code: "42703", message: 'column projects.hidden_columns does not exist' })).toBe(true);
    expect(isMissingSchema({ code: "42501", message: "permission denied for table tasks" })).toBe(false);
    expect(isMissingSchema(null)).toBe(false);
  });
});
