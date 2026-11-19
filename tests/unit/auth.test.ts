import { describe, expect, it } from "vitest";
import { can, hasRole } from "@/lib/auth/roles";
import { isPublicPath } from "@/lib/supabase/proxy";
import { loginSchema, safeNextPath, setPasswordSchema, signupSchema } from "@/lib/validation/auth";
import { inviteSchema } from "@/lib/validation/admin";
import { profileSchema } from "@/lib/validation/profile";

describe("hasRole", () => {
  it("orders levels admin > manager > technician > basic", () => {
    expect(hasRole("admin", "manager")).toBe(true);
    expect(hasRole("manager", "manager")).toBe(true);
    expect(hasRole("technician", "manager")).toBe(false);
    expect(hasRole("basic", "technician")).toBe(false);
    expect(hasRole(null, "basic")).toBe(false);
  });

  it("maps the permission table from the spec", () => {
    expect(can.manageUsers("manager")).toBe(false);
    expect(can.createProjects("manager")).toBe(true);
    expect(can.managementChat("technician")).toBe(false);
    expect(can.postDailyUpdate("technician")).toBe(true);
    expect(can.postDailyUpdate("basic")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/projects/1", "/projects/1"],
    ["https://evil.example", "/home"],
    ["//evil.example", "/home"],
    ["/\\evil.example", "/home"],
    [undefined, "/home"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("isPublicPath", () => {
  it("allows auth pages and share links, protects the app", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/share/abc")).toBe(true);
    expect(isPublicPath("/home")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/shared-secrets")).toBe(false);
  });
});

describe("validation", () => {
  it("normalises emails", () => {
    expect(loginSchema.parse({ email: "  Ada@Orion.TEST ", password: "x" }).email).toBe("ada@orion.test");
  });

  it("requires a reasonable password and matching confirmation", () => {
    const base = { firstName: "Ada", lastName: "A", email: "a@b.co" };
    expect(signupSchema.safeParse({ ...base, password: "short1", confirmPassword: "short1" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: "longenough", confirmPassword: "longenough" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: "longenough1", confirmPassword: "different1" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, password: "longenough1", confirmPassword: "longenough1" }).success).toBe(true);
    expect(setPasswordSchema.safeParse({ password: "abcdefg1", confirmPassword: "abcdefg1" }).success).toBe(true);
  });

  it("rejects unknown levels in invites", () => {
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "superuser" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.co", role: "technician" }).success).toBe(true);
  });

  it("cleans profile input", () => {
    expect(profileSchema.parse({ firstName: " Ada ", lastName: "B", phone: "" })).toEqual({
      firstName: "Ada",
      lastName: "B",
      phone: null,
    });
    expect(profileSchema.safeParse({ firstName: "A", lastName: "B", phone: "call me" }).success).toBe(false);
  });
});
