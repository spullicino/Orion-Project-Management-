import type { AppRole } from "@/types/database";

/**
 * "What's new" — newest first. ADD AN ENTRY AT THE TOP whenever a feature ships.
 * `id` must be unique (YYYY-MM-DD-name). The red dot shows when the entry at the
 * top isn't the one the person last saw.
 * `minRole` hides entries from people who can't use that feature.
 */
export type WhatsNewEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  body: string;
  help?: string; // link to the matching Help guide
  minRole?: AppRole;
};

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "2026-11-25-materials-by-project",
    date: "2026-11-25",
    title: "Material requests grouped by project",
    body: "Material requests (and the card on Home / Overview) are now grouped under each project with how many are open, urgent and late — projects needing attention first. Tap a project to fold it; switch “Group by project” off for the plain list.",
    help: "/help#materials",
    minRole: "manager",
  },
  {
    id: "2026-11-25-message-window",
    date: "2026-11-25",
    title: "Choose when important messages are sent again",
    body: "Unread important messages are now sent again only between 7am and 5pm by default. Change the default in Admin → Settings (times, weekdays only, how many days), or change it for a single message when you send it.",
    help: "/help#admin",
    minRole: "admin",
  },
  {
    id: "2026-11-25-quick-project-task",
    date: "2026-11-25",
    title: "Add project tasks straight from My Tasks",
    body: "My Tasks → New task now has a Project choice: pick a project and group to add a normal project task (with people, due date and priority) without opening the project — or leave it on “No project” for a general task.",
    help: "/help#my-tasks",
    minRole: "manager",
  },
  {
    id: "2026-11-25-general-tasks",
    date: "2026-11-25",
    title: "General tasks — not linked to a project",
    body: "Managers and administrators can give a colleague a task that isn't part of a project — e.g. chase a client about a tender. Tap “New task” in My Tasks, choose who, a due date and (optionally) the client. It shows in their My Tasks with reminders; follow it under “Tasks I gave”.",
    help: "/help#my-tasks",
    minRole: "technician",
  },
  {
    id: "2026-11-25-export-updates",
    date: "2026-11-25",
    title: "Export daily updates to Excel or PDF",
    body: "On Team daily updates (and Overview), tap “Export updates”: pick today, this week, last month or any dates, all projects or one, everyone or one person — and download Excel (with hours per person) or a PDF.",
    help: "/help#daily-update",
    minRole: "manager",
  },
  {
    id: "2026-11-25-important-messages",
    date: "2026-11-25",
    title: "Important messages people can't miss",
    body: "Admin → Important messages: send a message to a level, projects or chosen people. They get a phone notification that stays on screen, the message covers the app until they tap “I've read this”, and it's sent again until they do. You see who has read it.",
    help: "/help#admin",
    minRole: "admin",
  },
  {
    id: "2026-11-25-activity",
    date: "2026-11-25",
    title: "Activity: see who is using the app",
    body: "Admin → Activity lists everyone with when they last opened the app, their last daily update and whether phone notifications are on — least active first, so you can follow up.",
    help: "/help#admin",
    minRole: "admin",
  },
  {
    id: "2026-11-24-daily-reminder",
    date: "2026-11-24",
    title: "Reminder to post your daily update",
    body: "On working days at 4:30pm, technicians who haven't posted that day's daily update get a phone reminder — tap it to post. Administrators can change the time (or switch it off) in Admin → Settings.",
    help: "/help#daily-update",
    minRole: "technician",
  },
  {
    id: "2026-11-24-admin-names",
    date: "2026-11-24",
    title: "Administrators can fill in people's names",
    body: "In Admin, tap the pencil next to anyone to type their first name and surname — handy for people who only show as an email. A “No name yet” tag shows who still needs one.",
    help: "/help#admin",
    minRole: "admin",
  },
  {
    id: "2026-11-24-overview",
    date: "2026-11-24",
    title: "Overview: daily updates and material requests at a glance",
    body: "Home now starts with two cards: who has (and hasn't) posted today's daily update, and open material requests — urgent and late first. On phones, Overview replaces Daily Update in the bottom bar, with a red number when new material requests come in. Post your own update from the button on Overview.",
    help: "/help#home",
    minRole: "manager",
  },
  {
    id: "2026-11-24-products-excel",
    date: "2026-11-24",
    title: "Product list to and from Excel",
    body: "In Products, tap “Export to Excel” to download the full list. Add new products at the bottom of the spreadsheet and upload it with “Import from Excel” — only the new ones are added; existing products are left as they are.",
    help: "/help#materials",
    minRole: "manager",
  },
  {
    id: "2026-11-23-task-order",
    date: "2026-11-23",
    title: "Insert tasks in between, and reorder",
    body: "Open a task and tap “Insert task above/below” to add one exactly where it belongs — linked tasks stay in a chain (A → new → B). Drag tasks by their handle on the Board (or use Move up/down) to change the order. Managers can also move whole groups from the group's ⋯ menu. The Gantt follows.",
    help: "/help#tasks",
    minRole: "technician",
  },
  {
    id: "2026-11-23-products-report",
    date: "2026-11-23",
    title: "Product list and materials report",
    body: "When requesting materials, pick products from a list instead of typing them (the unit fills in). Managers keep the list under Products, and each project's Materials tab now has a materials report — what was delivered, per product, for any dates — as PDF or Excel.",
    help: "/help#materials",
  },
  {
    id: "2026-11-22-board-percent",
    date: "2026-11-22",
    title: "% complete on the Board and Kanban",
    body: "Each group on the Board shows how complete it is (e.g. “6 tasks · 85% complete”), and task cards on phones and on Kanban show their %.",
    help: "/help#tasks",
  },
  {
    id: "2026-11-22-gantt-percent",
    date: "2026-11-22",
    title: "% complete on the Gantt",
    body: "The Gantt chart (and its PDF export) now shows each task's % complete next to its name and beside its bar, and an average for each group — like a programme of works. PDF exports also print every page properly now.",
    help: "/help#gantt",
  },
  {
    id: "2026-11-22-material-requests",
    date: "2026-11-22",
    title: "Material requests 📦",
    body: "Ask for materials to be delivered to site from a project's new Materials tab — items, quantities, needed-by date and photos, even without signal. Managers mark them ordered and delivered, and you're told at each step. Includes a PDF for suppliers, Reorder, and a running list of what's been delivered.",
    help: "/help#materials",
  },
  {
    id: "2026-11-22-stay-signed-in",
    date: "2026-11-22",
    title: "Fewer unexpected sign-outs",
    body: "With “Keep me signed in” ticked, the app now keeps you signed in on iPhone too — a weak signal on site no longer sends you back to the sign-in page.",
  },
  {
    id: "2026-11-22-chat-media",
    date: "2026-11-22",
    title: "Photos & files in chats",
    body: "See every photo and file ever shared in a chat in one place — open the chat's ⋯ menu and tap “Photos & files”. Tap “Go to message” to jump to where it was posted.",
    help: "/help#chats",
  },
  {
    id: "2026-11-22-copy-task",
    date: "2026-11-22",
    title: "Copy a task to other projects",
    body: "Set up a task once — like a monthly bill — and copy it to other projects, each with its own date. Open the task and tap “Copy to other projects”.",
    help: "/help#tasks",
    minRole: "technician",
  },
  {
    id: "2026-11-21-project-access",
    date: "2026-11-21",
    title: "You only see your own projects",
    body: "Projects (and their tasks, chats, photos and updates) are now only visible to the people added to them. Managers see the projects they're on or created; administrators still see everything. Missing a project? Ask to be added in its Settings → People.",
    help: "/help#levels",
  },
  {
    id: "2026-11-21-whats-new",
    date: "2026-11-21",
    title: "What's new",
    body: "This list! Tap “What's new” on Home to see every improvement as it's added. A red dot means there's something you haven't seen yet.",
  },
  {
    id: "2026-11-21-internal-tasks",
    date: "2026-11-21",
    title: "Internal tasks 🔒",
    body: "Mark a task as Internal (e.g. “Issue monthly invoice”) to keep it off the client's programme of works. It's left out of client links, Gantt exports and % complete, but your team still sees it on the Board and My Tasks.",
    help: "/help#tasks",
  },
  {
    id: "2026-11-21-repeating-tasks",
    date: "2026-11-21",
    title: "Repeating tasks 🔁",
    body: "Tasks can repeat every day, weekday, week, 2 weeks, month, 3 months or year. When you mark one Done, the next one appears automatically with the same owners and checklist.",
    help: "/help#tasks",
  },
  {
    id: "2026-11-21-chat-notifications",
    date: "2026-11-21",
    title: "Chat messages on your phone",
    body: "Every new chat message now pops up on your phone, like WhatsApp — grouped per chat, with the unread count on the app icon. Tap “Turn on notifications” at the top of Chats. Mute a busy chat if it's too much.",
    help: "/help#chats",
  },
  {
    id: "2026-11-20-speed-check",
    date: "2026-11-20",
    title: "Speed check for administrators",
    body: "Admin → Speed check shows where the app's server runs and how quickly it reaches the database.",
    minRole: "admin",
  },
  {
    id: "2026-11-20-faster",
    date: "2026-11-20",
    title: "Faster app",
    body: "Pages load noticeably quicker, and when you tap something the new screen appears straight away while its details load.",
  },
  {
    id: "2026-11-20-bullet-lists",
    date: "2026-11-20",
    title: "Bullet lists in notes",
    body: "Personal notes have a Bullet list button. Press Enter for the next bullet, twice to end the list — or start a line with “- ”.",
    help: "/help#personal",
  },
  {
    id: "2026-11-20-help",
    date: "2026-11-20",
    title: "Help & how-to guides",
    body: "Step-by-step guides for every part of the app, with search. Find them under Help in the menu, or the ? at the top on phones.",
    help: "/help",
  },
  {
    id: "2026-11-20-personal",
    date: "2026-11-20",
    title: "Personal notes & to-dos",
    body: "Your own private to-do list (with reminders) and notes. Only you can see them — not your manager, not the administrators.",
    help: "/help#personal",
  },
  {
    id: "2026-11-20-remember-me",
    date: "2026-11-20",
    title: "Stay signed in",
    body: "“Keep me signed in on this device” on the sign-in page, and Home now greets you by name.",
    help: "/help#getting-started",
  },
  {
    id: "2026-11-20-launch",
    date: "2026-11-20",
    title: "Orion Projects is live 🚀",
    body: "Projects with Board, Kanban, Gantt and Calendar views; daily updates with site photos (even without signal); company, management and project chats; notifications and delay warnings; client share links and PDF exports; and an app you can install on your phone.",
    help: "/help#getting-started",
  },
];

/** Entries this person can use. */
export function whatsNewFor(role: AppRole, rank: (role: AppRole, min: AppRole) => boolean) {
  return WHATS_NEW.filter((e) => !e.minRole || rank(role, e.minRole));
}

/** Position of the last-seen entry (-1 if never seen / unknown). Lower = newer. */
export const seenIndex = (entries: WhatsNewEntry[], seen: string | null | undefined) => (seen ? entries.findIndex((e) => e.id === seen) : -1);

/** True if there's an entry newer than the one last seen. */
export function hasUnseen(entries: WhatsNewEntry[], seen: string | null | undefined) {
  return entries.length > 0 && seenIndex(entries, seen) !== 0;
}

/** Whether entry number `i` (0 = newest) is new for this person. */
export function isNewEntry(entries: WhatsNewEntry[], seen: string | null | undefined, i: number) {
  const s = seenIndex(entries, seen);
  return s === -1 || i < s;
}

/** The newer of two "last seen" markers. */
export function newerSeen(entries: WhatsNewEntry[], a: string | null, b: string | null) {
  const ia = seenIndex(entries, a);
  const ib = seenIndex(entries, b);
  if (ia === -1) return b;
  if (ib === -1) return a;
  return ia <= ib ? a : b;
}
