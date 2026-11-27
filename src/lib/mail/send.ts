import "server-only";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { emailConfigured } from "@/lib/notify/email";
import type { createAdminClient } from "@/lib/supabase/admin";
import { gmailFor } from "./gmail";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Sends one email to a customer: from support@ through Gmail when it's connected,
 * otherwise through the app's email settings (SMTP). Returns false when neither is set up.
 */
export async function sendCustomerEmail(admin: Admin, mail: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  const g = await gmailFor(admin).catch(() => null);
  if (g?.settings.mailbox) {
    const raw = await new MailComposer({ from: { name: "Orion Group Aftersales", address: g.settings.mailbox }, ...mail }).compile().build();
    await g.api.send(raw);
    return true;
  }
  if (!emailConfigured()) return false;
  const port = Number(process.env.SMTP_PORT || 465);
  await nodemailer
    .createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
    .sendMail({ from: process.env.EMAIL_FROM, ...mail });
  return true;
}
