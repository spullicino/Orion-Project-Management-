// Sample data for the development-only chat preview. Not used in production.
import type { ChannelSummary, ChatMessage, ChatPerson } from "@/types/chat";

const at = (minsAgo: number) => new Date(Date.UTC(2026, 10, 20, 14, 0) - minsAgo * 60_000).toISOString();
const people: ChatPerson[] = [
  { user_id: "u2", first_name: "Mark", last_name: "Borg", email: "manager@orion.test", avatar_url: null },
  { user_id: "u3", first_name: "Tina", last_name: "Camilleri", email: "tech1@orion.test", avatar_url: null },
  { user_id: "u5", first_name: "Ben", last_name: "Ellul", email: "basic@orion.test", avatar_url: null },
];
const author = (id: string) => {
  const p = people.find((x) => x.user_id === id)!;
  return { first_name: p.first_name, last_name: p.last_name, email: p.email, avatar_url: null };
};
const img = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="hsl(${hue},45%,60%)"/><rect x="100" y="380" width="600" height="120" fill="hsl(${hue},35%,38%)"/></svg>`)}`;
const base = { channel_id: "c1", parent_id: null, edited_at: null, deleted: false, attachments: [], reactions: [], reply_count: 0, last_reply_at: null, task: null, mentions: [] as string[] };

export const previewChannel: ChannelSummary = {
  id: "c1", type: "project", name: "Valletta Office Fit-out", description: null, project_id: "p1", project_color: "#2d57a3",
  archived: false, can_post: true, muted: false, unread: 0, last: null,
};

export const previewChannels: ChannelSummary[] = [
  { ...previewChannel, unread: 2, last: { body: "Photos of the east wall attached", created_at: at(5), deleted: false, has_attachments: true, author: "Tina Camilleri" } },
  { id: "c2", type: "general", name: "General & Announcements", description: null, project_id: null, project_color: null, archived: false, can_post: false, muted: false, unread: 1, last: { body: "Office closed on Friday for the public holiday.", created_at: at(60 * 26), deleted: false, has_attachments: false, author: "Ada Azzopardi" } },
  { id: "c3", type: "management", name: "Management", description: null, project_id: null, project_color: null, archived: false, can_post: true, muted: true, unread: 0, last: { body: "Tender for Mosta submitted.", created_at: at(60 * 24 * 3), deleted: false, has_attachments: false, author: "Mark Borg" } },
  { id: "c4", type: "project", name: "Mosta Solar Installation", description: null, project_id: "p2", project_color: "#ea580c", archived: false, can_post: true, muted: false, unread: 0, last: null },
];

export const previewMessages: ChatMessage[] = [
  { ...base, id: "m1", author_id: "u2", author: author("u2"), body: "Welcome to the project chat! Post questions and photos here.", created_at: at(60 * 24 + 30) },
  { ...base, id: "m2", author_id: "u3", author: author("u3"), body: "@Mark Borg the permit for wall chasing is still pending. Can you chase the landlord?", mentions: ["u2"], created_at: at(40),
    reactions: [{ emoji: "👍", count: 2, mine: true, names: ["Mark Borg", "Ben Ellul"] }], reply_count: 2, last_reply_at: at(20) },
  { ...base, id: "m3", author_id: "u2", author: author("u2"), body: "Calling them now. Details: https://example.com/permits/valletta-3f", created_at: at(38),
    task: { id: "t4", title: "Electrical first fix", project_id: "p1", completed: false } },
  { ...base, id: "m4", author_id: "u3", author: author("u3"), body: "Photos of the east wall attached", created_at: at(5),
    attachments: [1, 2, 3].map((i) => ({ id: `a${i}`, storage_path: "x.jpg", file_name: `wall-${i}.jpg`, mime_type: "image/jpeg", size_bytes: 300000, width: 800, height: 600, url: img(i * 70), thumb_url: img(i * 70) })) },
  { ...base, id: "m5", author_id: "u3", author: author("u3"), body: "And the drawing:", created_at: at(4),
    attachments: [{ id: "f1", storage_path: "x.pdf", file_name: "Drawing-A-102.pdf", mime_type: "application/pdf", size_bytes: 284000, width: null, height: null, url: "#", thumb_url: null }] },
];

export const previewPeople = people;
