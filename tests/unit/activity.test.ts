import { describe, expect, it } from "vitest";
import { activityLevel, lastSeenLabel, lastUpdateLabel } from "@/lib/activity/format";

// Wednesday 25 Nov 2026, 15:00 Malta (14:00 UTC)
const now = Date.parse("2026-11-25T14:00:00Z");

describe("Admin → Activity labels", () => {
  it("describes when someone was last active", () => {
    expect(lastSeenLabel(null, now)).toBe("Never");
    expect(lastSeenLabel("2026-11-25T08:20:00Z", now)).toBe("Today 09:20");
    expect(lastSeenLabel("2026-11-24T20:30:00Z", now)).toBe("Yesterday 21:30");
    expect(lastSeenLabel("2026-11-20T10:00:00Z", now)).toBe("5 days ago");
    expect(lastSeenLabel("2026-10-01T10:00:00Z", now)).toBe("1 Oct");
  });

  it("uses Malta days, so just after midnight counts as today", () => {
    expect(lastSeenLabel("2026-11-24T23:30:00Z", now)).toBe("Today 00:30");
  });

  it("colours people by how long ago they were active", () => {
    expect(activityLevel("2026-11-25T08:00:00Z", now)).toBe("today");
    expect(activityLevel("2026-11-23T08:00:00Z", now)).toBe("recent");
    expect(activityLevel("2026-11-21T08:00:00Z", now)).toBe("quiet");
    expect(activityLevel("2026-11-17T08:00:00Z", now)).toBe("inactive");
    expect(activityLevel(null, now)).toBe("inactive");
  });

  it("describes the last daily update", () => {
    expect(lastUpdateLabel(null, now)).toBe("Never");
    expect(lastUpdateLabel("2026-11-25", now)).toBe("Today");
    expect(lastUpdateLabel("2026-11-24", now)).toBe("Yesterday");
    expect(lastUpdateLabel("2026-11-21", now)).toBe("4 days ago");
  });
});
