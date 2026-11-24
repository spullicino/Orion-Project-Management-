# Orion Projects

Project management for the Orion Group team: boards, Kanban, Gantt charts, a daily site diary with photos, chats and notifications. It works in any browser and installs on Android and iPhone like a normal app — and keeps working with a poor signal.

**Status: complete (phases 1–7).**

---

## Contents

**Setting it up (once)**

1. [What you need](#1-what-you-need)
2. [Create the Supabase project](#2-create-the-supabase-project)
3. [Set up the database](#3-set-up-the-database)
4. [Sign-in settings and email templates](#4-sign-in-settings-and-email-templates)
5. [Send email from your own domain](#5-send-email-from-your-own-domain-smtp)
6. [Turn on "Sign in with Google"](#6-turn-on-sign-in-with-google)
7. [Put the app online with Vercel](#7-put-the-app-online-with-vercel)
8. [Use your own web address](#8-use-your-own-web-address)
9. [Become the first Administrator](#9-become-the-first-administrator)
10. [Turn on notifications and the daily job](#10-turn-on-notifications-and-the-daily-job)
11. [Final checklist](#11-final-checklist)

**Using it**

12. [Install it on phones (instructions for staff)](#12-install-it-on-phones)
13. [How everything works](#13-how-everything-works)
14. [Who can do what](#14-who-can-do-what)
15. [Working without signal](#15-working-without-signal)

**Looking after it**

16. [Updating to a new version](#16-updating-to-a-new-version)
17. [Backups, security and costs](#17-backups-security-and-costs)
18. [Troubleshooting](#18-troubleshooting)
19. [For developers](#19-for-developers)

Allow about **2 hours** for the first setup. No coding is needed — you copy and paste values between websites. Keep a password manager or private note open to collect them.

---

## 1. What you need

| Account | What it's for | Cost |
|---|---|---|
| **GitHub** (you have it) | Stores the app's code | Free |
| **Supabase** — supabase.com | Database, logins, photo storage, live chat | Free to try; **Pro (~$25/month) recommended** for company use (daily backups, more photo storage) |
| **Vercel** — vercel.com | Runs the website, daily job | Free "Hobby" to try; **Pro** for company use |
| **Google Cloud** — console.cloud.google.com | "Sign in with Google" | Free |
| **Resend** (resend.com) or your Microsoft 365 / Google Workspace mail | Sign-up, password and summary emails from your own address | Free up to 3,000 emails/month (Resend) |
| **Your domain's DNS** (whoever manages `oriongroup.com.mt`) | The app's address and email delivery | — |

---

## 2. Create the Supabase project

1. Go to **supabase.com** → **New project**.
   - **Name:** `orion-projects` · **Region:** **Central EU (Frankfurt)** (closest to Malta, keeps data in the EU).
   - **Database password:** *Generate*, then save it in your password manager.
2. When it's ready: **Project Settings → API Keys**. Copy:
   - the **Project URL** — exactly `https://<letters>.supabase.co` (nothing after `.co`; find it under *Project Settings → General → Project ID*: it's `https://` + the ID + `.supabase.co`);
   - the **publishable** key (`sb_publishable_…`, older projects: *anon*);
   - the **secret** key (`sb_secret_…`, older projects: *service_role*) — **never share it**.

---

## 3. Set up the database

**New installation — one paste:**

1. In GitHub open **`supabase/setup/all-in-one.sql`**, click the **copy icon** ("Copy raw file").
2. In Supabase: **SQL Editor → + New query**, paste, **Run**. You should see *Success*. (If Supabase asks you to confirm, choose *Run this query*.)
3. **Table Editor** should now list tables such as `profiles`, `projects`, `tasks`, `daily_updates`, `messages`, `notifications`.

**Do not** run `supabase/seed.sql` on your real project — it creates demo accounts with a public password (for testing only).

*(Already installed an earlier version? See [Updating to a new version](#16-updating-to-a-new-version) instead.)*

---

## 4. Sign-in settings and email templates

In Supabase, **Authentication**:

1. **Sign In / Providers → Email:** *Enable Email provider* **on**, *Confirm email* **on**, minimum password length **8**. *Allow new users to sign up* **on**.
2. **URL Configuration:** set after step 7/8 — *Site URL* = the app's address (e.g. `https://projects.oriongroup.com.mt`), *Redirect URLs* = the same followed by `/**`.
3. **Emails → Templates** — for each, set the subject and paste the matching file from `supabase/templates/` (copy icon in GitHub):

   | Template | Subject | File |
   |---|---|---|
   | Confirm signup | Confirm your email for Orion Projects | `confirmation.html` |
   | Invite user | You're invited to Orion Projects | `invite.html` |
   | Reset Password | Reset your Orion Projects password | `recovery.html` |
   | Change Email Address | Confirm your new email for Orion Projects | `email_change.html` |
   | Magic Link | Your Orion Projects sign-in link | `magic_link.html` |

---

## 5. Send email from your own domain (SMTP)

Supabase's built-in email only reaches **your own Supabase login address** and a few emails per hour. Until this step is done, **other people can't complete sign-up** (they never get the confirmation email). You can still add people by hand: *Authentication → Users → Add user*, tick *Auto Confirm User*.

1. Create an account at **resend.com** → **Domains → Add domain**, e.g. `mail.oriongroup.com.mt`.
2. Send the 3–4 DNS records it shows to whoever manages your DNS; wait for **Verified**.
3. **API Keys → Create** (Sending access). Copy it.
4. Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP:**
   Sender `noreply@mail.oriongroup.com.mt`, name `Orion Projects`, host `smtp.resend.com`, port `465`, user `resend`, password = the API key.
5. **Authentication → Rate Limits:** raise *emails per hour* to about 100.

Keep these SMTP details — the daily email summary uses them too (step 10).

---

## 6. Turn on "Sign in with Google"

1. **console.cloud.google.com** → new project *Orion Projects*.
2. **APIs & Services → OAuth consent screen:** *External* (anyone with a Google account; they still need your approval) or *Internal* (only `@oriongroup.com.mt` Workspace accounts). App name, support email, authorised domains `oriongroup.com.mt` and `supabase.co`. **Publish app**.
3. **Credentials → Create credentials → OAuth client ID → Web application:**
   - *Authorised JavaScript origins:* your app address (e.g. `https://projects.oriongroup.com.mt`);
   - *Authorised redirect URIs:* `https://<your-project>.supabase.co/auth/v1/callback` (copy it from Supabase's Google provider page).
4. Supabase → **Authentication → Sign In / Providers → Google:** on, paste *Client ID* and *Client secret*, **Save**.

---

## 7. Put the app online with Vercel

1. **vercel.com → Add New… → Project → Import** `Orion-Project-Management-`.
2. **Environment Variables** (names exactly as written):

   | Name | Value | Needed for |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | everything |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key | everything |
   | `SUPABASE_SECRET_KEY` | secret key (mark as *Sensitive*) | invites, push, daily job |
   | `BOOTSTRAP_ADMIN_EMAIL` | your email | becoming the first admin |
   | `NEXT_PUBLIC_SITE_URL` | `https://projects.oriongroup.com.mt` (once you have it — step 8) | email links |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` | from step 10 | notifications, daily job |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | from step 5 | daily email summary |

   Vercel may warn that `NEXT_PUBLIC_…` values are visible to browsers — that's expected and safe for those two (choose *Config* if asked). Keep the names unchanged.
3. **Deploy.** Your app is at `https://<name>.vercel.app`.
4. Put that address in Supabase **URL Configuration** (step 4.2).
5. After changing any variable: **Deployments → ⋯ → Redeploy**.
6. The app's server runs in **Frankfurt** (`fra1`, set in `vercel.json`), next to the database. If **Settings → Functions → Function Region** shows anything else, set it to Frankfurt and redeploy. **Admin → Speed check** confirms it.

---

## 8. Use your own web address

1. Vercel → **Settings → Domains → Add** `projects.oriongroup.com.mt`. Give the DNS record it shows (usually a `CNAME` to `cname.vercel-dns.com`) to your DNS manager.
2. When it shows *Valid*: update **Supabase URL Configuration** (Site URL + Redirect URL), **Google** *Authorised JavaScript origins*, and Vercel's `NEXT_PUBLIC_SITE_URL`. Redeploy.

---

## 9. Become the first Administrator

1. Make sure `BOOTSTRAP_ADMIN_EMAIL` is your email (and the app has been redeployed since).
2. Open the app, **Create an account** with that email (or *Continue with Google*), confirm via the email.
3. You land on **Home** as **Administrator**. (This only works while there's no administrator yet.)

---

## 10. Turn on notifications and the daily job

1. In the app: **Admin → Setup: notifications & daily job → Generate keys for Vercel**.
2. Add the values shown to Vercel (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`), plus `VAPID_SUBJECT` = `mailto:` + your email. Generate push keys **once** — new keys mean everyone has to switch notifications on again.
3. Optional email summary: add the SMTP values from step 5 (`EMAIL_FROM` like `Orion Projects <noreply@mail.oriongroup.com.mt>`).
4. Redeploy. The Setup card should show green ticks. The daily job runs every morning around 07:30 Malta time (`vercel.json`).

---

## 11. Final checklist

- [ ] Sign up with a second (test) email → confirmation email arrives from your domain → you can approve it in **Admin**.
- [ ] **Continue with Google** works.
- [ ] **Admin → Invite someone** sends an invitation email.
- [ ] Create a project, add a task, change its status, open the **Gantt**, **Export** a PDF, create a **client link** and open it in a private window.
- [ ] On a phone: post a **Daily Update** with a photo; try again in airplane mode — it sends when the signal is back.
- [ ] Send a chat message between two people; try an @mention.
- [ ] **Profile → Notifications → Turn on notifications → Send a test** on Android and on an installed iPhone app.
- [ ] **Admin → Setup** shows all ticks.

---

## 12. Install it on phones

Send this to your team:

> **iPhone (Safari):** open the app address → tap **Share** (square with arrow) → **Add to Home Screen** → **Add**. Open it from the new icon. To get notifications: in the app, **Profile → Notifications → Turn on notifications** (needs iOS 16.4 or newer).
>
> **Android (Chrome):** open the app address → tap **Install** when asked, or **⋮ → Install app**. Then **Profile → Notifications → Turn on notifications**.
>
> **Computer (Chrome/Edge):** click the install icon in the address bar.

The app also shows an *Install Orion Projects* pop-up on phones from the second visit, and **Profile → Install the app** always has the steps.

---

## 13. How everything works

**Projects** — Managers create projects (blank, from a template, or as a copy), choose the team, client, dates and colour. Each project has tabs:

- **Dashboard** — % complete, overdue and due-soon counts, tasks by status, workload per person, *Needs attention* list, upcoming milestones and the health badge.
- **Board** — groups of tasks with status, owners, priority, dates, progress, *Waiting for* (dependencies) and any extra columns. Phones show cards. Tap a task for details: description, checklist, files, comments, history.
- **Repeating tasks** — in a task, set **Repeat** (daily, weekdays, weekly, every 2 weeks, monthly, every 3 months, yearly; optional end date). Marking it Done creates the next one with the same owners and checklist.
- **Products** (managers) — the list workers pick from in material requests (name, unit, category, code); import from Excel; retire old ones. Each project's Materials tab has a **Materials report** (delivered per product, any dates) as PDF or Excel (CSV).
- **Materials** — workers request materials (items, quantities, needed-by, photos; works offline). The project's managers mark them *Ordered* (supplier, PO, expected date), *Delivered* / *Partly delivered* or *Rejected*; everyone is notified. PDF for suppliers, Reorder, and *Delivered so far* per project. All requests across your projects: **Materials** in the menu.
- **Task order** — *Insert task above/below* (in the task panel; rewires linked tasks A → new → B, later dates aren't moved) and drag to reorder on the Board (or *Move up/down*); the Gantt follows.
- **Copy a task to other projects** — in a task, *Copy to other projects*: pick projects, a group and due date for each. Details, checklist, Internal and Repeat settings come along; owners only if they're on that project.
- **Internal tasks** — switch on **Internal** in a task (🔒) for team-only work such as invoicing: never on client links or exports, not counted in % complete or health, hidden on Gantt/Kanban unless *Show internal tasks* is on.
- **Kanban** — drag cards between statuses (on phones: press and hold).
- **Gantt** — timeline with milestones and dependency arrows; managers drag bars to change dates; **Export** (PDF/PNG) and **Share with client** (read-only link, no login, expires/revokable).
- **Calendar** — due dates and milestones by month.
- **Diary / Photos** — daily updates and every site photo.
- **Chat** — the project's conversation.
- **Settings** (managers) — details, people, statuses, columns, save as template, delete (admins).

**My Tasks** — everything assigned to you, grouped by due date; tick to mark done.

**What's new** (button next to the greeting on Home) — a dated list of new features; a red dot shows when there's something the person hasn't seen. Developers: add an entry at the top of `src/lib/whats-new.ts` with every new feature.

**Help** (sidebar, the **?** at the top on phones, or Profile) — step-by-step guides for every part of the app, searchable, showing only what each person's level can do. To change the text, edit `src/lib/help.ts`.

**Personal** (sidebar, Home, or Profile on phones) — your own private **to-dos** (optional due date; you get a reminder the day before and on the day) and **notes** (title, text with bullet lists, colour, pin to top, search; saved automatically as you type). **Only you can see them — not managers, not administrators.** The database itself enforces this.

**Daily Update** — what you did, hours, issues and photos (shrunk on the phone). Managers: **Team overview & reports** shows who has/hasn't posted for any day and makes **PDF reports** for clients.

**Chats** — *Photos & files* (⋯ menu) shows everything shared in a chat, with *Go to message*. General & Announcements (everyone reads, managers post), Management (managers & admins), one per project. Reactions, replies, @mentions, photos/files, task links, unread badges, mute.

**Notifications** — every **chat message** pops up on phones like WhatsApp (grouped per chat, red count on the app icon; not sent for muted chats). 🔔 bell plus phone push for: tasks given to you, @mentions, comments/status changes on your tasks, due/overdue tasks, and (managers) new daily updates. Each person chooses in **Profile → Notifications**, including quiet hours and a daily email summary.

**Delay warnings** — red ⛔ = overdue or waiting for a late task; amber ⚠ = due within 2 days with < 50 % done, behind schedule, or waiting for an unfinished task that should start soon. Projects show **On track / Needs attention / At risk**.

**Admin** — approve people and set their level, invite by email, deactivate, settings (can Basic users post in chats), notification/daily-job setup. **Clients** (managers) — client details and logos for exports.

---

## 14. Who can do what

The database itself enforces these rules (not just the buttons), so they can't be bypassed.

| Level | Can do |
|---|---|
| **Administrator** | Everything: users and levels, settings, **all** projects (even ones they're not on), management chat, delete anything |
| **Manager** | Create projects; on projects they're on (or created): edit, assign people, Gantt, exports and client links, daily reports. Management chat |
| **Technician** | Assigned projects only: create/update tasks (not delete), assign themselves, daily updates and photos, project chats |
| **Basic** | Read-only on assigned projects; reads chats (writes only if allowed in Admin → Settings) |

People waiting for approval or deactivated see nothing. Daily updates can be edited/deleted by their author for 24 hours (managers always). All files and photos are private and shown through short-lived links.

---

## 15. Working without signal

- **Pages you've opened** (and Home, Daily Update, My Tasks, Projects, Chats — saved after you sign in) open even with no signal, showing what they had last time. A dark bar says you're offline.
- **Daily updates** are always saved on the phone first and sent automatically when the signal returns — even if the app was closed. A yellow bar shows anything waiting.
- Photos you've seen recently stay visible.
- Changing tasks and sending chat messages need a connection (you'll see a clear message if it fails).
- Saved pages are wiped from the device when someone **signs out**, so shared phones stay private.

---

## 16. Updating to a new version

1. New code is deployed automatically by Vercel when it's merged on GitHub.
2. If the update includes **new database files** (`supabase/migrations/…`), run **only the new ones**, in number order, in Supabase **SQL Editor** — the release notes say which. If a screen says *"The database needs an update"*, a file was missed.
3. If the update mentions new settings, add them in Vercel and redeploy.

Database files applied so far: `…0001` to `…0024` (`supabase/setup/all-in-one.sql` contains all of them, for new installations only).

---

## 17. Backups, security and costs

- **Backups:** Supabase **Pro** takes daily backups (restorable from the dashboard). On the free plan there are none — upgrade before real use.
- **Keep secret:** `SUPABASE_SECRET_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, SMTP password. If one leaks, create a new one (Supabase → API Keys; Admin → Setup for the others) and update Vercel.
- **When someone leaves:** Admin → **Deactivate** (blocks sign-in immediately). Turn off any client links they shouldn't keep.
- **Client links** can be turned off any time (Gantt → Share with client).
- **Photo storage:** each photo is about 0.3–0.6 MB. Supabase Pro includes 100 GB.
- The site sends strict security headers (no framing, content security policy, HTTPS only).

---

## 18. Troubleshooting

| Problem | Fix |
|---|---|
| "We couldn't create your account … Invalid path specified" | `NEXT_PUBLIC_SUPABASE_URL` must be exactly `https://<id>.supabase.co`. Redeploy after fixing. |
| "We couldn't send the confirmation email" | Email sending isn't set up (step 5). Meanwhile add the person in Supabase → *Authentication → Users → Add user* with *Auto Confirm*. |
| "That link is invalid or has expired" | Links work once, for 1 hour. Check Site URL / Redirect URLs (step 4.2) and request a new link. |
| "Waiting for approval" for the first admin | Check `BOOTSTRAP_ADMIN_EMAIL`, redeploy, tap *Check again*. Last resort, in SQL Editor: `update profiles set role='admin', status='active' where email='you@example.com';` |
| "The database needs an update" | Run the newest file(s) from `supabase/migrations` (section 16). |
| "permission denied for table …" | A database file is missing — run the files in order (section 16). |
| No phone notifications | Admin → Setup shows ticks? Person turned them on in Profile? iPhone: installed to Home Screen and opened from there? Quiet hours? Try *Send a test*. |
| Google: "redirect_uri_mismatch" | The redirect URI in Google must exactly match Supabase's Google provider page. |
| A page says "Sorry, this page couldn't load" | Tap *Try again*. If it persists, send the code shown, plus Vercel → *Logs* around that time, to your developer. |
| The app feels slow | **Admin → Speed check**: the server should be Frankfurt (`fra1`) and the database response under 40 ms. If not, see step 7.6. On Supabase's free plan the database also pauses after a week of no use, and the first visit after that is slow. |
| The logo doesn't show in emails | Outlook/Gmail may block pictures: click *Show images*. |

---

## 19. For developers

### Stack

Next.js 16 (App Router, Server Actions, `src/proxy.ts`), TypeScript, Tailwind CSS 4 with shadcn-style components (`src/components/ui`), Supabase (Postgres + RLS, Auth, private Storage, Realtime) via `@supabase/ssr`, Zod validation, `@dnd-kit` (Kanban), custom SVG Gantt with `jspdf` + `svg2pdf.js` exports, `browser-image-compression` (worker self-hosted in `public/vendor`), `idb` offline outbox, `web-push`, `nodemailer`. Hand-written service worker in `public/sw.js` (offline shell, last-viewed pages, push). Cache Components is off on purpose (every screen is per-user).

### Run locally

```bash
npm install
cp .env.example .env.local        # fill from `npx supabase status`
npx supabase start                # needs Docker; local email inbox at http://localhost:54324
npx supabase db reset             # migrations + demo seed
npm run dev                       # http://localhost:3000
```

Demo logins (local only, password `OrionDemo!2026`): `admin@`, `manager@`, `tech1@`, `tech2@`, `basic@`, `pending@orion.test`.

Development-only previews with sample data (no database needed): `/dev/board-preview?view=board|kanban|gantt|calendar|dashboard`, `/dev/diary-preview`, `/dev/chat-preview`, `/dev/notifications-preview`, `/dev/share-preview`. They return 404 in production.

### Tests

| Command | What it checks |
|---|---|
| `npm run test:unit` | Utilities, validation, permissions, delay rules, Gantt layout, chat helpers, calendar, migration bundle up to date |
| `npm run test:rls` | **Row Level Security per role** and every database function (62 tests). Runs against the local Supabase, or any *empty* Postgres 15+ via `RLS_DATABASE_URL` using `tests/rls/supabase-shim.sql` (this is what CI does). |
| `npm run test:e2e` | Playwright on phone + desktop: auth pages, installability (manifest/icons/splash), offline page, accessibility (axe, WCAG 2 AA) and CSP. Specs tagged `@supabase` (login, create task, daily update with photo, Gantt PDF export + client link, chat, notifications) need `E2E_SUPABASE=1` and a seeded local Supabase. |
| `npm run lint` / `npm run typecheck` | Style and types |

### Adding a database change

Add a new file in `supabase/migrations/` (never edit an applied one), add RLS policies and tests in `tests/rls/rls.test.ts`, then `npm run db:bundle` to refresh `supabase/setup/all-in-one.sql` (a unit test fails if you forget).

### Folder structure

```
supabase/
  migrations/        0001 foundation … 0024 user activity (append-only)
  setup/             all-in-one.sql (generated: every migration, for new installs)
  seed.sql           demo data (local/testing only)
  templates/         branded auth emails
src/
  proxy.ts           session refresh + sign-in redirect
  app/
    (auth)/ auth/ pending/ account-problem/ offline/ share/[token]/
    (app)/           home, projects/[id]/{dashboard,board,kanban,gantt,calendar,diary,photos,chat,settings},
                     my-tasks, daily-update(/team), chats(/[id]), notifications, clients, profile, admin
    api/cron/daily   daily job (CRON_SECRET)
    manifest.ts      installable app
  components/        ui/ layout/ board/ gantt/ calendar/ diary/ chat/ notifications/ dashboard/ pwa/ …
  lib/
    supabase/ auth/ validation/ data/      server access, roles, Zod schemas, loaders
    board.ts health.ts chat.ts calendar.ts pure, unit-tested logic
    gantt/ (layout + export)  diary/report.ts  offline/ (outbox, sync, upload)  notify/ (push, email, queue)
public/sw.js         service worker
tests/unit  tests/rls  tests/e2e
```

### Security model

- Every table has RLS; policies call helpers in the private `app` schema (`app.can_view_project`, `app.can_edit_project`, `app.can_post_channel`, …) that return *false* for pending/deactivated users.
- Read-side database functions are `SECURITY INVOKER` (RLS applies). The few `SECURITY DEFINER` ones are narrow: notification triggers, the client share-link lookup (token checked, client-safe fields only) and server-only jobs (execute granted to `service_role` only).
- Level/status changes are blocked by a trigger unless done by an admin; admins can't demote themselves.
- The secret key is only used server-side after role checks (invites, push, daily job, rate limiting).
- Uploads go straight to private buckets via short-lived signed URLs; files are read via signed URLs.
- Production sends CSP, HSTS, `X-Frame-Options: DENY`, `nosniff` and a strict referrer policy.
