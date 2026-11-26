import { describe, expect, it } from "vitest";
import { bannerRange, bannerState } from "@/lib/banner";
import { bannerSchema } from "@/lib/validation/banner";

const now = new Date(2026, 10, 26, 10, 0); // Thu 26 Nov 2026, 10:00 local

describe("banner: how long it shows", () => {
  it("presets end at the end of the last day (today counts as day 1)", () => {
    const at = (c: Parameters<typeof bannerRange>[0]) => {
      const r = bannerRange(c, now);
      if ("error" in r) throw new Error(r.error);
      return r;
    };
    expect(at("today").endsAt).toEqual(new Date(2026, 10, 26, 23, 59));
    expect(at("3d").endsAt).toEqual(new Date(2026, 10, 28, 23, 59));
    expect(at("1w").endsAt).toEqual(new Date(2026, 11, 2, 23, 59));
    expect(at("2w").endsAt).toEqual(new Date(2026, 11, 9, 23, 59));
    expect(at("forever")).toEqual({ startsAt: now, endsAt: null });
  });

  it("custom dates: until, and from–to for later", () => {
    expect(bannerRange("until", now, { toDate: "2026-11-30", toTime: "17:00" })).toEqual({ startsAt: now, endsAt: new Date(2026, 10, 30, 17, 0) });
    expect(bannerRange("range", now, { fromDate: "2026-12-01", fromTime: "07:00", toDate: "2026-12-03", toTime: "17:00" })).toEqual({
      startsAt: new Date(2026, 11, 1, 7, 0),
      endsAt: new Date(2026, 11, 3, 17, 0),
    });
  });

  it("rejects impossible choices", () => {
    expect(bannerRange("until", now, {})).toEqual({ error: "Choose when it ends" });
    expect(bannerRange("until", now, { toDate: "2026-11-25", toTime: "12:00" })).toEqual({ error: "The end must be after the start" });
    expect(bannerRange("range", now, { fromDate: "2026-12-03", fromTime: "07:00", toDate: "2026-12-01", toTime: "07:00" })).toEqual({ error: "The end must be after the start" });
  });

  it("knows whether it's showing, scheduled, paused or ended", () => {
    const b = (starts: Date, ends: Date | null, paused = false) => ({ paused, starts_at: starts.toISOString(), ends_at: ends?.toISOString() ?? null });
    expect(bannerState(b(new Date(2026, 10, 25), null), now)).toBe("showing");
    expect(bannerState(b(new Date(2026, 10, 27), null), now)).toBe("scheduled");
    expect(bannerState(b(new Date(2026, 10, 25), null, true), now)).toBe("paused");
    expect(bannerState(b(new Date(2026, 10, 20), new Date(2026, 10, 21), true), now)).toBe("ended");
  });
});

describe("banner: validation", () => {
  const base = { body: "Toolbox talk Monday 7:30", link: "", tone: "info" as const, startsAt: "2026-11-26T08:00:00.000Z", endsAt: null, audience: { type: "everyone" as const } };
  it("accepts a normal message and turns an empty link into none", () => {
    const r = bannerSchema.safeParse(base);
    expect(r.success && r.data.link).toBe(null);
  });
  it("only allows web links or pages in the app", () => {
    expect(bannerSchema.safeParse({ ...base, link: "/projects" }).success).toBe(true);
    expect(bannerSchema.safeParse({ ...base, link: "https://orion.com.mt" }).success).toBe(true);
    expect(bannerSchema.safeParse({ ...base, link: "javascript:alert(1)" }).success).toBe(false);
  });
  it("keeps it short and the end after the start", () => {
    expect(bannerSchema.safeParse({ ...base, body: "x".repeat(201) }).success).toBe(false);
    expect(bannerSchema.safeParse({ ...base, endsAt: "2026-11-26T07:00:00.000Z" }).success).toBe(false);
    expect(bannerSchema.safeParse({ ...base, audience: { type: "levels", roles: [] } }).success).toBe(false);
  });
});
