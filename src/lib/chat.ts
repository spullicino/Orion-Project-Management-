import type { ChatMessage, ChatPerson } from "@/types/chat";

const name = (p: { first_name: string | null; last_name: string | null; email?: string | null }) =>
  [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Someone";

export type ListItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: ChatMessage; showHeader: boolean };

const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Malta" }).format(new Date(iso));

export function dayLabel(iso: string, now = new Date()) {
  const k = dayKey(iso);
  if (k === dayKey(now.toISOString())) return "Today";
  if (k === dayKey(new Date(now.getTime() - 86_400_000).toISOString())) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Malta" }).format(new Date(iso));
}

/** Day separators, and only show the name/avatar when the author changes or 5+ minutes pass. */
export function buildList(messages: ChatMessage[], now = new Date()): ListItem[] {
  const out: ListItem[] = [];
  let lastDay = "";
  let prev: ChatMessage | null = null;
  for (const m of messages) {
    const d = dayKey(m.created_at);
    if (d !== lastDay) {
      out.push({ kind: "day", key: `day-${d}`, label: dayLabel(m.created_at, now) });
      lastDay = d;
      prev = null;
    }
    const showHeader =
      !prev || prev.author_id !== m.author_id || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60_000 || prev.deleted;
    out.push({ kind: "message", key: m.id, message: m, showHeader });
    prev = m;
  }
  return out;
}

/** Merges new/updated messages into a list (by id), keeping it in time order. */
export function mergeMessages(list: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** If the caret is right after "@something", returns that partial name. */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}'-]{0,30})$/u.exec(before);
  if (!m) return null;
  return { query: m[2], start: caret - m[2].length - 1 };
}

export function filterPeople(people: ChatPerson[], query: string, max = 6) {
  const q = query.toLowerCase();
  return people.filter((p) => name(p).toLowerCase().split(/\s+/).some((part) => part.startsWith(q)) || name(p).toLowerCase().startsWith(q)).slice(0, max);
}

export type Segment = { type: "text"; text: string } | { type: "mention"; text: string; me: boolean } | { type: "link"; text: string; href: string };

/** Splits a message into plain text, @mentions of people in `mentioned`, and clickable links. */
export function segmentBody(body: string, mentioned: { id: string; name: string }[], meId: string): Segment[] {
  const names = [...mentioned].sort((a, b) => b.name.length - a.name.length);
  const escaped = names.map((n) => n.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = [...(escaped.length ? [`@(?:${escaped.join("|")})`] : []), "https?://[^\\s<]+[^\\s<.,;:!?)\\]'\"]"];
  const re = new RegExp(parts.join("|"), "gu");
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index! > last) out.push({ type: "text", text: body.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("@")) {
      const who = names.find((n) => `@${n.name}` === t);
      out.push({ type: "mention", text: t, me: who?.id === meId });
    } else out.push({ type: "link", text: t, href: t });
    last = m.index! + t.length;
  }
  if (last < body.length) out.push({ type: "text", text: body.slice(last) });
  return out;
}

export function chatTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }).format(new Date(iso));
}

/** "10:42", "Yesterday", "Mon", or "12/03" for the chat list. */
export function listTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  if (dayKey(iso) === dayKey(now.toISOString())) return chatTime(iso);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 2 && dayLabel(iso, now) === "Yesterday") return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Malta" }).format(d);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Europe/Malta" }).format(d);
}

export { name as personName };
