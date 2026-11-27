import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer";
import { describe, expect, it } from "vitest";
import { isAutomatic, replySubject, stripQuoted, ticketNumberFromSubject } from "@/lib/mail/rules";

const headersOf = (m: Awaited<ReturnType<typeof simpleParser>>) => {
  const h: Record<string, string> = {};
  for (const [k, v] of m.headers) h[k] = typeof v === "string" ? v : JSON.stringify(v);
  return h;
};

describe("a real email, read the way the app reads support@", () => {
  it("a customer's reply: ticket number, sender, new text only, thread ids and the photo", async () => {
    const raw = await new MailComposer({
      from: { name: "Anna Zammit", address: "Anna@Solair.com.mt" },
      to: "support@oriongroup.com.mt",
      subject: "RE: [OGT-1024] Fire alarm panel beeping",
      text: "Still beeping this morning.\n\nOn Fri, 27 Nov 2026 at 10:00, Orion Group Aftersales <support@oriongroup.com.mt> wrote:\n> We'll be there at 14:00",
      html: "<p>Still beeping this morning.</p>",
      inReplyTo: "<abc@oriongroup.com.mt>",
      references: ["<first@solair.com.mt>", "<abc@oriongroup.com.mt>"],
      attachments: [{ filename: "panel.jpg", content: Buffer.alloc(120_000, 1), contentType: "image/jpeg" }],
    })
      .compile()
      .build();
    const m = await simpleParser(raw);
    const from = m.from!.value[0];
    expect(from.address!.toLowerCase()).toBe("anna@solair.com.mt");
    expect(from.name).toBe("Anna Zammit");
    expect(ticketNumberFromSubject(m.subject)).toBe(1024);
    expect(isAutomatic(headersOf(m), from.address!, m.subject)).toBe(false);
    expect(stripQuoted(m.text)).toBe("Still beeping this morning.");
    expect(m.inReplyTo).toBe("<abc@oriongroup.com.mt>");
    expect(m.references).toEqual(["<first@solair.com.mt>", "<abc@oriongroup.com.mt>"]);
    expect(m.attachments.map((a) => [a.filename, a.size])).toEqual([["panel.jpg", 120_000]]);
  });

  it("our own reply is a proper email in the same conversation", async () => {
    const raw = await new MailComposer({
      from: { name: "Orion Group Aftersales", address: "support@oriongroup.com.mt" },
      to: { name: "Anna Zammit", address: "anna@solair.com.mt" },
      subject: replySubject("OGT-1024", "Fire alarm panel beeping"),
      text: "We'll be there at 14:00.\n\nOrion Group — Aftersales",
      messageId: "<reply-1@oriongroup.com.mt>",
      inReplyTo: "<first@solair.com.mt>",
      references: ["<first@solair.com.mt>"],
    })
      .compile()
      .build();
    const m = await simpleParser(raw);
    expect(m.subject).toBe("Re: [OGT-1024] Fire alarm panel beeping");
    expect(m.messageId).toBe("<reply-1@oriongroup.com.mt>");
    expect(m.inReplyTo).toBe("<first@solair.com.mt>");
    expect(m.text?.trim()).toBe("We'll be there at 14:00.\n\nOrion Group — Aftersales");
  });

  it("an out-of-office reply is recognised", async () => {
    const raw = await new MailComposer({
      from: "anna@solair.com.mt",
      to: "support@oriongroup.com.mt",
      subject: "Automatic reply: [OGT-1024] Fire alarm panel beeping",
      text: "I'm away until Monday.",
      headers: { "Auto-Submitted": "auto-replied" },
    })
      .compile()
      .build();
    const m = await simpleParser(raw);
    expect(isAutomatic(headersOf(m), "anna@solair.com.mt", m.subject)).toBe(true);
  });
});
