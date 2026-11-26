import { describe, expect, it } from "vitest";
import { prefsSchema } from "@/lib/validation/notifications";

const base = { push_enabled: true, email_digest: false, quiet_hours_from: null, quiet_hours_to: null };

describe("saving notification settings", () => {
  it("accepts settings where only some (or none) of the switches were changed", () => {
    expect(prefsSchema.safeParse({ ...base, types: {} }).success).toBe(true);
    expect(prefsSchema.safeParse({ ...base, email_digest: true, types: { "daily.new": false } }).success).toBe(true);
    expect(prefsSchema.safeParse({ ...base, types: { "chat.message": false }, quiet_hours_from: "21:00", quiet_hours_to: "07:00" }).success).toBe(true);
  });
  it("still rejects nonsense", () => {
    expect(prefsSchema.safeParse({ ...base, types: { "made.up": true } }).success).toBe(false);
    expect(prefsSchema.safeParse({ ...base, types: {}, quiet_hours_from: "9pm" }).success).toBe(false);
  });
});
