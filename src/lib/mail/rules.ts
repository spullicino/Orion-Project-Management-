/**
 * Aftersales email rules (no server code — unit-tested): which ticket an email
 * belongs to, what's an automatic reply, and the customer's words without the
 * quoted history underneath.
 */

/** "OGT-1234" (or the old "TKT-1234") anywhere in a subject → 1234. */
export function ticketNumberFromSubject(subject: string | null | undefined): number | null {
  const m = /\b(?:OGT|TKT)[\s-]?(\d{3,9})\b/i.exec(subject ?? "");
  return m ? Number(m[1]) : null;
}

const PREFIX = /^\s*((re|fw|fwd|aw|sv|antw|wg|rif|r)\s*(\[\d+\])?\s*:\s*)+/i;
const TAG = /\[\s*(?:OGT|TKT)[\s-]?\d{3,9}\s*\]\s*/gi;

/** The subject without Re:/Fwd: and our [OGT-…] tag — what the ticket is called. */
export function cleanSubject(subject: string | null | undefined): string {
  let s = (subject ?? "").replace(TAG, " ");
  for (let i = 0; i < 5 && PREFIX.test(s); i++) s = s.replace(PREFIX, "");
  s = s.replace(TAG, " ").replace(/\s+/g, " ").trim();
  return s || "(no subject)";
}

/** For comparing two subjects: clean, lower case. */
export const subjectKey = (subject: string | null | undefined) => cleanSubject(subject).toLowerCase();

/** "Re: [OGT-1234] Fire panel" for our emails. */
export const replySubject = (ref: string, subject: string) => `Re: [${ref}] ${cleanSubject(subject)}`;

/** Out-of-office, bounces, newsletters and other emails no person wrote. */
export function isAutomatic(headers: Record<string, string>, fromAddress: string, subject: string | null | undefined): boolean {
  const h = (k: string) => (headers[k.toLowerCase()] ?? "").toLowerCase().trim();
  if (h("auto-submitted") && h("auto-submitted") !== "no") return true;
  if (h("x-autoreply") || h("x-autorespond") || h("x-autoresponder")) return true;
  if (["bulk", "junk", "list", "auto_reply"].includes(h("precedence"))) return true;
  if (h("list-id") || h("list-unsubscribe")) return true;
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce[s]?)([+.@-]|$)/i.test(fromAddress)) return true;
  if (/^\s*(automatic reply|auto(matic)?[- ]?(reply|response)|out of (the )?office|undeliverable|delivery status notification|mail delivery failed)/i.test(subject ?? "")) return true;
  return false;
}

/**
 * The new part of a reply: everything above "On … wrote:", "-----Original Message-----",
 * an Outlook "From: … Sent:" block, or lines quoted with ">". Falls back to the whole
 * text if nothing would be left.
 */
export function stripQuoted(text: string | null | undefined): string {
  const full = (text ?? "").replace(/\r\n?/g, "\n");
  const cuts = [
    /\n[ \t]*On [^\n]{0,300}(?:\n[^\n]{0,300})?\bwrote:[ \t]*\n/i,
    /\n[ \t]*-{2,}[ \t]*Original Message[ \t]*-{2,}/i,
    /\n[ \t]*_{8,}[ \t]*\n[ \t]*From:/i,
    /\n[ \t]*From:[^\n]+\n[ \t]*(Sent|Date):[^\n]+\n/i,
    /\n[ \t]*Il-[^\n]{0,200}kiteb:[ \t]*\n/i, // Maltese "… kiteb:"
  ];
  let end = full.length;
  for (const re of cuts) {
    const m = re.exec(`\n${full}`);
    if (m) end = Math.min(end, Math.max(0, m.index - 1));
  }
  const kept = full
    .slice(0, end)
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return kept || full.trim();
}

/** "Anna Zammit" from the display name, else "anna.zammit" → "Anna Zammit". */
export function nameFromSender(name: string | null | undefined, address: string): string {
  const n = (name ?? "").replace(/["']/g, "").trim();
  if (n && !n.includes("@")) return n.slice(0, 160);
  const local = address.split("@")[0] ?? address;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 160);
}

/** Fill in the automatic reply: {ticket} → OGT-1234, {name} → the customer's name, {portal} → the portal address. */
export function fillTemplate(text: string, values: { ticket: string; name?: string; portal?: string }) {
  return text.replaceAll("{ticket}", values.ticket).replaceAll("{name}", values.name ?? "").replaceAll("{portal}", values.portal ?? "");
}
