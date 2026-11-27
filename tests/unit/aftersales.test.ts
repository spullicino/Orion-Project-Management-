import { describe, expect, it } from "vitest";
import { parseTicketRef, ticketRef, warrantyState } from "@/lib/aftersales";
import { contactSchema, messageSchema, newTicketSchema, siteSchema } from "@/lib/validation/aftersales";

describe("aftersales helpers", () => {
  it("ticket numbers read and write as OGT-1024 (old TKT- still found)", () => {
    expect(ticketRef(1024)).toBe("OGT-1024");
    for (const s of ["OGT-1024", "ogt 1024", "  1024 ", "OGT1024", "TKT-1024"]) expect(parseTicketRef(s)).toBe(1024);
    expect(parseTicketRef("fire alarm")).toBeNull();
    expect(parseTicketRef("OGT-")).toBeNull();
  });

  it("warranty: in, ended, or unknown", () => {
    expect(warrantyState("2026-12-31", "2026-11-27")).toBe("in");
    expect(warrantyState("2026-11-27", "2026-11-27")).toBe("in");
    expect(warrantyState("2026-11-26", "2026-11-27")).toBe("ended");
    expect(warrantyState(null, "2026-11-27")).toBeNull();
  });
});

describe("aftersales validation", () => {
  const id = "60000000-0000-4000-8000-0000000000a1";
  it("a new ticket needs a subject; the rest is optional", () => {
    const base = { subject: "Fire panel beeping", priority: "normal", category_id: null, customer_id: null, contact_id: null, site_id: null, assigned_to: null };
    expect(newTicketSchema.safeParse(base).success).toBe(true);
    expect(newTicketSchema.safeParse({ ...base, subject: "  " }).success).toBe(false);
    expect(newTicketSchema.safeParse({ ...base, priority: "asap" }).success).toBe(false);
  });
  it("contacts: email is checked and stored in lower case; something must be given", () => {
    const r = contactSchema.safeParse({ customer_id: id, name: "", email: "Mr.Borg@Example.COM", phone: "" });
    expect(r.success && r.data.email).toBe("mr.borg@example.com");
    expect(contactSchema.safeParse({ customer_id: id, name: "", email: "not-an-email", phone: "" }).success).toBe(false);
    expect(contactSchema.safeParse({ customer_id: id, name: "", email: "", phone: "" }).success).toBe(false);
  });
  it("sites: empty dates become none", () => {
    const r = siteSchema.safeParse({ customer_id: id, name: "Block B", handover_date: "", warranty_end: "2027-06-30" });
    expect(r.success && [r.data.handover_date, r.data.warranty_end]).toEqual([null, "2027-06-30"]);
  });
  it("messages: only replies, notes and what the customer said", () => {
    expect(messageSchema.safeParse({ ticket_id: id, kind: "note", body: "Battery low" }).success).toBe(true);
    expect(messageSchema.safeParse({ ticket_id: id, kind: "event", body: "Closed" }).success).toBe(false);
    expect(messageSchema.safeParse({ ticket_id: id, kind: "reply", body: " " }).success).toBe(false);
  });
});

describe("response targets on screen", async () => {
  const { slaInfo, metTargets, roughDuration } = await import("@/lib/aftersales");
  const now = Date.parse("2030-01-14T10:00:00Z");
  const at = (h: number) => new Date(now + h * 3_600_000).toISOString();
  const base = { status: "in_progress" as const, first_response_at: null, first_response_due: at(3), resolve_due: at(30), paused_since: null };

  it("shows the next target: first reply, then the fix", () => {
    expect(slaInfo(base, now)).toMatchObject({ kind: "first", overdue: false, soon: false, label: "Reply due in 3 h" });
    expect(slaInfo({ ...base, first_response_due: at(-2) }, now)).toMatchObject({ overdue: true, label: "Reply overdue 2 h" });
    expect(slaInfo({ ...base, first_response_due: at(1) }, now)).toMatchObject({ soon: true });
    expect(slaInfo({ ...base, first_response_at: at(-1) }, now)).toMatchObject({ kind: "resolve", label: "Fix due in 30 h" });
    expect(slaInfo({ ...base, first_response_at: at(-1), resolve_due: at(-72) }, now)).toMatchObject({ overdue: true, label: "Fix overdue 3 days" });
  });
  it("is quiet while waiting for the customer, and gone once resolved", () => {
    expect(slaInfo({ ...base, status: "waiting", paused_since: at(-1), first_response_due: at(-5) }, now)).toMatchObject({ paused: true, overdue: false });
    expect(slaInfo({ ...base, status: "resolved" }, now)).toBeNull();
  });
  it("on time or late, for the report", () => {
    expect(metTargets({ ...base, first_response_at: at(1), resolved_at: at(20) }, now)).toEqual({ firstOk: true, fixOk: true });
    expect(metTargets({ ...base, first_response_at: at(4), resolved_at: at(31) }, now)).toEqual({ firstOk: false, fixOk: false });
    expect(metTargets({ ...base, resolved_at: null }, now)).toEqual({ firstOk: null, fixOk: null });
    expect(roughDuration(30 * 60_000)).toBe("30 min");
  });
});

describe("monthly report", async () => {
  const { buildReport, pct } = await import("@/lib/aftersales-report");
  const now = Date.parse("2030-01-31T12:00:00Z");
  const t = (o: Partial<Parameters<typeof buildReport>[0][number]>) => ({
    number: 1, subject: "x", priority: "normal" as const, status: "resolved" as const, created_at: "2030-01-02T08:00:00Z",
    first_response_at: "2030-01-02T09:00:00Z", first_response_due: "2030-01-02T16:00:00Z", resolve_due: "2030-01-09T16:00:00Z",
    resolved_at: "2030-01-05T10:00:00Z", paused_since: null, assignee: "Joe", category: "CCTV", customer: "Solair", ...o,
  });
  it("counts on time and late per person and category", () => {
    const r = buildReport([t({}), t({ first_response_at: "2030-01-03T09:00:00Z", resolved_at: "2030-01-12T10:00:00Z" }), t({ assignee: null, category: "Intercom", status: "in_progress", resolved_at: null })], now);
    expect(r.total).toMatchObject({ tickets: 3, firstOn: 2, firstLate: 1, fixOn: 1, fixLate: 2, open: 1 });
    expect(r.people.map((p) => [p.name, p.tickets])).toEqual([["Joe", 2], ["Not assigned", 1]]);
    expect(r.categories[0]).toMatchObject({ name: "CCTV", tickets: 2 });
    expect(r.byStatus.resolved).toBe(2);
    expect(pct(2, 1)).toBe("67%");
    expect(pct(0, 0)).toBe("—");
  });
});
