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
