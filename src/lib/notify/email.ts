import "server-only";
import * as nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";

export const emailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);

type Recipient = {
  user_id: string;
  email: string;
  first_name: string;
  notifications: { title: string; body: string | null; link: string | null }[];
  tasks: { title: string; due_date: string; project: string; link: string }[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export function digestHtml(r: Recipient, site: string, today: string) {
  const link = (path: string | null) => `${site}${path ?? "/notifications"}`;
  const tasks = r.tasks
    .map((t) => {
      const when = t.due_date < today ? `<span style="color:#dc2626;font-weight:600">overdue (${fmt(t.due_date)})</span>` : t.due_date === today ? "due today" : "due tomorrow";
      return `<li style="margin:0 0 8px"><a href="${esc(link(t.link))}" style="color:#2d57a3;font-weight:600;text-decoration:none">${esc(t.title)}</a><br><span style="color:#64748b;font-size:13px">${esc(t.project)} · ${when}</span></li>`;
    })
    .join("");
  const notes = r.notifications
    .map((n) => `<li style="margin:0 0 8px"><a href="${esc(link(n.link))}" style="color:#0f172a;text-decoration:none">${esc(n.title)}</a>${n.body ? `<br><span style="color:#64748b;font-size:13px">${esc(n.body.slice(0, 140))}</span>` : ""}</li>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
<tr><td style="padding:18px 24px;border-bottom:4px solid #02b5ef"><img src="${site}/brand/orion-logo.png" alt="Orion" height="36" style="vertical-align:middle"> <span style="color:#64748b;font-weight:700;letter-spacing:2px;font-size:12px;margin-left:8px">PROJECTS</span></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 4px;font-size:20px">Good morning ${esc(r.first_name || "")}</h1>
<p style="margin:0 0 20px;color:#64748b">Here's your Orion Projects summary.</p>
${tasks ? `<h2 style="font-size:15px;margin:0 0 10px">Your tasks due soon</h2><ul style="padding-left:18px;margin:0 0 20px">${tasks}</ul>` : ""}
${notes ? `<h2 style="font-size:15px;margin:0 0 10px">Since yesterday</h2><ul style="padding-left:18px;margin:0 0 20px">${notes}</ul>` : ""}
<a href="${site}/home" style="display:inline-block;background:#2d57a3;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Open Orion Projects</a>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">You get this because the daily summary is on. Turn it off in Profile → Notifications.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Emails the daily summary to everyone who switched it on and has something to read. */
export async function sendDigests(site: string, today: string): Promise<{ sent: number; skipped: string | null }> {
  if (!emailConfigured()) return { sent: 0, skipped: "Email (SMTP) is not set up" };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_digest_recipients");
  if (error) throw error;
  const recipients = ((data ?? []) as unknown as Recipient[]).filter((r) => r.tasks.length || r.notifications.length);
  if (!recipients.length) return { sent: 0, skipped: null };
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  let sent = 0;
  for (const r of recipients) {
    try {
      await transport.sendMail({
        from: process.env.EMAIL_FROM,
        to: r.email,
        subject: `Orion Projects: ${r.tasks.length ? `${r.tasks.length} task${r.tasks.length === 1 ? "" : "s"} due` : "your daily summary"}`,
        html: digestHtml(r, site, today),
      });
      sent++;
    } catch (e) {
      console.error("digest email failed", r.email, (e as Error).message);
    }
  }
  return { sent, skipped: null };
}
