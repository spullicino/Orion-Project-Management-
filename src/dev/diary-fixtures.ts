// Sample data for the development-only diary preview. Not used in production.
import { addDays, todayISO } from "@/lib/board";
import type { DailyUpdate, DiaryPhoto, GalleryPhoto } from "@/types/diary";

const svg = (hue: number, label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="hsl(${hue},45%,62%)"/><rect x="80" y="380" width="640" height="140" fill="hsl(${hue},35%,40%)"/><text x="400" y="300" font-size="64" text-anchor="middle" fill="white" font-family="Arial">${label}</text></svg>`,
  )}`;
const photo = (id: string, hue: number, label: string): DiaryPhoto => ({ id, storage_path: `${id}.jpg`, width: 800, height: 600, caption: null, thumb_url: svg(hue, label), full_url: svg(hue, label) });

const today = todayISO();
const tina = { first_name: "Tina", last_name: "Camilleri", email: "tech1@orion.test", avatar_url: null };
const tom = { first_name: "Tom", last_name: "Debono", email: "tech2@orion.test", avatar_url: null };
const valletta = { id: "20000000-0000-4000-8000-000000000001", name: "Valletta Office Fit-out", color: "#2d57a3" };

export const previewUpdates: DailyUpdate[] = [
  {
    id: "u1", project_id: valletta.id, author_id: "u3", work_date: today, work_done: "Boarding meeting room 2 complete. Electrical containment marked out on level 3.",
    hours: 7.5, issues: "Permit for wall chasing still pending from the landlord.", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    project: valletta, author: tina, photos: [photo("p1", 210, "Room 2"), photo("p2", 30, "Containment"), photo("p3", 140, "Corridor")],
  },
  {
    id: "u2", project_id: valletta.id, author_id: "u4", work_date: today, work_done: "Delivered and stacked plasterboard for level 3.",
    hours: 4, issues: null, created_at: new Date(Date.now() - 3600e3).toISOString(), updated_at: new Date().toISOString(),
    project: valletta, author: tom, photos: [],
  },
  {
    id: "u3", project_id: valletta.id, author_id: "u3", work_date: addDays(today, -1), work_done: "Finished stud framing on the east side. Started boarding meeting room 2.",
    hours: 8, issues: null, created_at: new Date(Date.now() - 86400e3).toISOString(), updated_at: new Date().toISOString(),
    project: valletta, author: tina, photos: Array.from({ length: 10 }, (_, i) => photo(`q${i}`, i * 36, `Photo ${i + 1}`)),
  },
];

export const previewGallery: GalleryPhoto[] = previewUpdates.flatMap((u) =>
  u.photos.map((p) => ({ ...p, created_at: u.created_at, work_date: u.work_date, daily_update_id: u.id, author: u.author })),
);
