import type { MaterialListItem } from "@/types/materials";

export type ProjectGroup<T extends Pick<MaterialListItem, "project" | "urgent" | "late"> = MaterialListItem> = {
  project: MaterialListItem["project"];
  items: T[];
  urgent: number;
  late: number;
};

/**
 * Material requests grouped by project. Projects with urgent or late requests
 * come first (most first), then the rest A–Z. Order inside a group is kept.
 */
export function groupByProject<T extends Pick<MaterialListItem, "project" | "urgent" | "late">>(list: T[]): ProjectGroup<T>[] {
  const by = new Map<string, ProjectGroup<T>>();
  for (const r of list) {
    const g = by.get(r.project.id) ?? { project: r.project, items: [], urgent: 0, late: 0 };
    g.items.push(r);
    if (r.urgent) g.urgent++;
    if (r.late) g.late++;
    by.set(r.project.id, g);
  }
  return [...by.values()].sort(
    (a, b) => b.urgent + b.late - (a.urgent + a.late) || a.project.name.localeCompare(b.project.name, undefined, { numeric: true }),
  );
}
