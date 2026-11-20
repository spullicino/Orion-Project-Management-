import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fullName(p: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return name || p.email || "Unknown user";
}

export function initials(p: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  const a = p.first_name?.trim()?.[0] ?? "";
  const b = p.last_name?.trim()?.[0] ?? "";
  const s = `${a}${b}`.toUpperCase();
  return s || (p.email?.[0]?.toUpperCase() ?? "?");
}

/** Formats a date as DD/MM/YYYY in Malta time. */
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Malta", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** Collapses form errors from Zod into { field: message }. */
export function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "form");
    out[key] ??= i.message;
  }
  return out;
}

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Dark or white text — whichever is easier to read on this background colour (WCAG contrast). */
export function readableTextOn(bg: string): "#0f172a" | "#ffffff" {
  const L = luminance(bg);
  const onWhite = 1.05 / (L + 0.05);
  const onDark = (L + 0.05) / (luminance("#0f172a") + 0.05);
  return onWhite >= onDark ? "#ffffff" : "#0f172a";
}
