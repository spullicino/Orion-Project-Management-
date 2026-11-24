import type { DailyStatus, DailyUpdate } from "@/types/diary";
import type { MaterialListItem } from "@/types/materials";

/** Sample data for the Team overview previews (development only). */
export function overviewFixture(): {
  status: DailyStatus;
  feed: DailyUpdate[];
  requests: MaterialListItem[];
} {
  const solair = { id: "p1", name: "OG5376 - Solair Apartments", color: "#2563eb" };
  const villa = { id: "p2", name: "OG5545 - Embark - Qormi", color: "#16a34a" };
  const person = (first: string, last: string) => ({
    first_name: first,
    last_name: last,
    email: null,
  });
  const status: DailyStatus = [
    {
      project: solair,
      update_count: 2,
      people: [
        { ...person("Mark", "Borg"), user_id: "u1", posted: true },
        { first_name: null, last_name: null, email: "someone.with.a.long.address19@gmail.com", user_id: "u2", posted: false },
        { ...person("Anna", "Zammit"), user_id: "u3", posted: true },
      ],
    },
    {
      project: villa,
      update_count: 0,
      people: [{ ...person("Joe", "Vella"), user_id: "u4", posted: false }],
    },
  ];
  const now = new Date().toISOString();
  const update = (
    id: string,
    project: typeof solair,
    author: ReturnType<typeof person>,
    work: string,
    issues: string | null,
  ): DailyUpdate => ({
    id,
    project_id: project.id,
    author_id: id,
    work_date: now.slice(0, 10),
    work_done: work,
    hours: 8,
    issues,
    created_at: now,
    updated_at: now,
    project,
    author,
    photos: [],
  });
  const feed = [
    update(
      "d1",
      solair,
      person("Mark", "Borg"),
      "Installed 110mm drainage pipes on level 2 and fixed brackets along the north wall. Started on the soil stack.",
      null,
    ),
    update(
      "d2",
      solair,
      person("Anna", "Zammit"),
      "Plasterboard on level 3 apartments 1–4 done.",
      "Waiting for screws delivery",
    ),
  ];
  const req = (
    n: number,
    project: typeof solair,
    status: MaterialListItem["status"],
    summary: string,
    extra: Partial<MaterialListItem> = {},
  ): MaterialListItem => ({
    id: `r${n}`,
    number: n,
    status,
    needed_by: null,
    urgent: false,
    supplier: null,
    po_number: null,
    expected_date: null,
    created_at: now,
    updated_at: now,
    delivered_at: null,
    project,
    requested_by: {
      id: "u1",
      ...person("Mark", "Borg"),
    } as MaterialListItem["requested_by"],
    item_count: 3,
    summary,
    photo_count: 0,
    comment_count: 0,
    late: false,
    ...extra,
  });
  const requests = [
    req(
      14,
      solair,
      "requested",
      "Pipe 110mm × 10, Elbow 110mm × 6, Bracket 110mm × 20",
      { urgent: true },
    ),
    req(13, villa, "ordered", "Plasterboard 12.5mm × 40", {
      needed_by: "2026-11-20",
      late: true,
    }),
    req(12, solair, "requested", "Hand glove × 10"),
    req(11, solair, "partly_delivered", "Drywall screws × 5 boxes"),
    req(10, villa, "delivered", "Grout × 4"),
  ];
  return { status, feed, requests };
}
