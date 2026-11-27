import { describe, expect, it } from "vitest";
import { cleanSubject, fillTemplate, isAutomatic, nameFromSender, replySubject, stripQuoted, subjectKey, ticketNumberFromSubject } from "@/lib/mail/rules";

describe("which ticket an email belongs to", () => {
  it("finds the ticket number in the subject", () => {
    expect(ticketNumberFromSubject("Re: [OGT-1024] Fire panel beeping")).toBe(1024);
    expect(ticketNumberFromSubject("RE: RE: ogt-1024 still not working")).toBe(1024);
    expect(ticketNumberFromSubject("Fwd: [TKT-1003] old number")).toBe(1003);
    expect(ticketNumberFromSubject("Order 1024 delivery")).toBeNull();
    expect(ticketNumberFromSubject(null)).toBeNull();
  });
  it("cleans subjects so replies match the original", () => {
    expect(cleanSubject("Re: Fwd: RE: [OGT-1024]   Fire panel beeping")).toBe("Fire panel beeping");
    expect(cleanSubject("AW: SV: Intercom")).toBe("Intercom");
    expect(cleanSubject("")).toBe("(no subject)");
    expect(subjectKey("RE: CCTV Camera 3")).toBe(subjectKey("cctv camera 3"));
    expect(replySubject("OGT-1024", "Re: Fire panel")).toBe("Re: [OGT-1024] Fire panel");
  });
});

describe("automatic emails are ignored", () => {
  it("spots out-of-office, bounces and newsletters", () => {
    expect(isAutomatic({ "auto-submitted": "auto-replied" }, "anna@solair.com.mt", "Re: Fire panel")).toBe(true);
    expect(isAutomatic({}, "anna@solair.com.mt", "Automatic reply: Fire panel")).toBe(true);
    expect(isAutomatic({}, "anna@solair.com.mt", "Out of Office: back Monday")).toBe(true);
    expect(isAutomatic({ precedence: "bulk" }, "news@shop.com", "Black Friday")).toBe(true);
    expect(isAutomatic({ "list-unsubscribe": "<mailto:x>" }, "news@shop.com", "Offers")).toBe(true);
    expect(isAutomatic({}, "MAILER-DAEMON@googlemail.com", "Delivery Status Notification (Failure)")).toBe(true);
    expect(isAutomatic({}, "noreply@vendor.com", "Your invoice")).toBe(true);
  });
  it("lets real emails through", () => {
    expect(isAutomatic({ "auto-submitted": "no" }, "anna@solair.com.mt", "Fire panel beeping")).toBe(false);
    expect(isAutomatic({}, "norbert@solair.com.mt", "Reply about the intercom")).toBe(false);
  });
});

describe("only the new part of a reply is kept", () => {
  it("cuts Gmail, Outlook and quoted history", () => {
    expect(stripQuoted("Still beeping.\n\nOn Fri, 27 Nov 2026 at 10:00, Orion Group <support@oriongroup.com.mt> wrote:\n> We will come at 2pm")).toBe("Still beeping.");
    expect(stripQuoted("Thanks!\n\nOn Fri, 27 Nov 2026 at 10:00 Orion Group\n<support@oriongroup.com.mt> wrote:\n> old")).toBe("Thanks!");
    expect(stripQuoted("Ok see you then\r\n\r\nFrom: Orion Group <support@oriongroup.com.mt>\r\nSent: Friday, 27 November 2026 10:00\r\nTo: Anna\r\nSubject: RE: x")).toBe("Ok see you then");
    expect(stripQuoted("Noted\n-----Original Message-----\nFrom: x")).toBe("Noted");
    expect(stripQuoted("Line one\n> quoted\nLine two")).toBe("Line one\nLine two");
  });
  it("keeps everything when there's nothing quoted, or nothing would be left", () => {
    expect(stripQuoted("Hello,\n\nThe panel shows a fault.\n\nAnna")).toBe("Hello,\n\nThe panel shows a fault.\n\nAnna");
    expect(stripQuoted("> only quoted")).toBe("> only quoted");
  });
});

describe("names and templates", () => {
  it("names the sender", () => {
    expect(nameFromSender("Anna Zammit", "anna@solair.com.mt")).toBe("Anna Zammit");
    expect(nameFromSender('"anna@solair.com.mt"', "anna.zammit@solair.com.mt")).toBe("Anna Zammit");
    expect(nameFromSender(null, "mark_borg@gmail.com")).toBe("Mark Borg");
  });
  it("fills the automatic reply", () => {
    expect(fillTemplate("Logged as {ticket}. Thanks {name}", { ticket: "OGT-1024", name: "Anna" })).toBe("Logged as OGT-1024. Thanks Anna");
  });
});
