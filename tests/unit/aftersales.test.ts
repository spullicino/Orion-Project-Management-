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
