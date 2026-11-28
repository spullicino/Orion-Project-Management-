/** Home cards each person can put in their own order (and hide). Saved on their account. */
export type HomeCardId = "daily" | "materials" | "tasks" | "tickets" | "attention" | "shortcuts";
export type HomeLayout = { order: HomeCardId[]; hidden: HomeCardId[] };

export const HOME_CARD_LABEL: Record<HomeCardId, string> = {
  daily: "Daily updates today",
  materials: "Material requests",
  tasks: "My Tasks",
  tickets: "My tickets (Aftersales)",
  attention: "Projects that need attention",
  shortcuts: "Shortcuts (Projects, Chats…)",
};
export const DEFAULT_ORDER: HomeCardId[] = ["daily", "materials", "tasks", "tickets", "attention", "shortcuts"];

const isId = (v: unknown): v is HomeCardId => typeof v === "string" && v in HOME_CARD_LABEL;

/** A saved layout made safe: known cards only, nothing twice, and any new card added at its default place. */
export function normalizeLayout(raw: unknown, available: HomeCardId[]): HomeLayout {
  const r = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; hidden?: unknown };
  const saved = Array.isArray(r.order) ? r.order.filter(isId) : [];
  const order: HomeCardId[] = [];
  for (const id of saved) if (available.includes(id) && !order.includes(id)) order.push(id);
  // Cards the saved order doesn't know yet go where they'd be by default.
  for (const id of DEFAULT_ORDER) {
    if (!available.includes(id) || order.includes(id)) continue;
    const before = DEFAULT_ORDER.slice(0, DEFAULT_ORDER.indexOf(id)).filter((x) => order.includes(x));
    const at = before.length ? order.indexOf(before[before.length - 1]) + 1 : 0;
    order.splice(at, 0, id);
  }
  const hidden = Array.isArray(r.hidden) ? [...new Set(r.hidden.filter(isId))].filter((id) => available.includes(id)) : [];
  return { order, hidden };
}

export function moveCard(order: HomeCardId[], id: HomeCardId, to: number): HomeCardId[] {
  const from = order.indexOf(id);
  if (from < 0) return order;
  const next = order.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id);
  return next;
}
