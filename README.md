# Orion Projects

Project management for the Orion Group team: boards, Gantt charts, daily site updates with photos, and chat. It works in any browser and can be installed on Android and iPhone like an app.

> **Status: Phase 1 of 7.** Sign-in (Google and email), user levels, admin approval, invitations, profiles and the full database with its security rules are done. Projects, Gantt charts, daily updates, chats and notifications are added in the next phases. Screens for those show "Coming in phase X" for now.

---

## Contents

1. [What you need before you start](#1-what-you-need-before-you-start)
2. [Create the Supabase project (database and logins)](#2-create-the-supabase-project)
3. [Load the database tables](#3-load-the-database-tables)
4. [Turn on email confirmation and the Orion email templates](#4-sign-in-settings-and-email-templates)
5. [Send email from your own domain (SMTP)](#5-send-email-from-your-own-domain-smtp)
6. [Turn on "Sign in with Google"](#6-turn-on-sign-in-with-google)
7. [Put the app online with Vercel](#7-put-the-app-online-with-vercel)
8. [Become the first Administrator](#8-become-the-first-administrator)
9. [Everyday admin tasks](#9-everyday-admin-tasks)
10. [Who can do what (user levels)](#10-who-can-do-what)
11. [Troubleshooting](#11-troubleshooting)
12. [For developers](#12-for-developers)

Allow about **1–2 hours** for the first setup. You don't need to write any code. You will copy and paste some values between websites.

---

## 1. What you need before you start

| Account | What it's for | Cost |
|---|---|---|
| **GitHub** (you already have it) | Stores the app's code | Free |
| **Supabase**: supabase.com | Database, logins, photo storage, live chat | Free to start. **Pro (about $25/month) is recommended** once the team is uploading daily photos |
| **Vercel**: vercel.com | Runs the website | Free "Hobby" plan to test. Use "Pro" for company use |
| **Google Cloud**: console.cloud.google.com | "Sign in with Google" | Free |
| **An email-sending service**, e.g. **Resend** (resend.com) | Sends confirmation and password emails from your own address | Free up to 3,000 emails a month |
| **Access to your domain's DNS** (whoever manages `oriongroup.com.mt`) | So the app has its own address and emails aren't marked as spam | — |

Keep a notepad (a password manager is ideal) open. You'll collect a few values along the way:

- Supabase **Project URL**
- Supabase **publishable key**
- Supabase **secret key** (treat this like a password)
- Google **Client ID** and **Client secret**
- SMTP **host, port, username, password**

---

## 2. Create the Supabase project

1. Go to **supabase.com** and sign in (you can sign in with GitHub).
2. Click **New project**.
   - **Name:** `orion-projects`
   - **Database password:** click *Generate*, then save it in your password manager.
   - **Region:** **Central EU (Frankfurt)**. It's closest to Malta and keeps data in the EU (GDPR).
3. Click **Create new project** and wait about 2 minutes.
4. Open **Project Settings → API Keys**. Copy these into your notepad:
   - **Project URL** (looks like `https://abcd1234.supabase.co`). It may be shown on the *Data API* page.
   - **Publishable key** (starts with `sb_publishable_`). Older projects call this the `anon` key.
   - **Secret key** (starts with `sb_secret_`). Older projects call this the `service_role` key. **Never share it.**

---

## 3. Load the database tables

This creates all the tables and the security rules that decide who can see what.

**Option A: no tools needed (SQL Editor)**

1. In Supabase, open **SQL Editor** → **New query**.
2. In GitHub, open the folder `supabase/migrations`. There are files numbered `…0001_foundation.sql` up to `…0006_storage.sql`.
3. For **each file, in number order**: open it in GitHub, click **Raw**, select all, copy, paste into the SQL Editor, and click **Run**. You should see *"Success. No rows returned"*.
4. **Do not** run `supabase/seed.sql` on your real project. It creates demo users with a public password and is only for testing.

**Option B: command line (if someone technical is helping)**

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

When new phases add database changes, repeat this step for the **new** files only.

---

## 4. Sign-in settings and email templates

In Supabase, open **Authentication**:

1. **URL Configuration**
   - **Site URL:** the app's final address, e.g. `https://projects.oriongroup.com.mt`
   - **Redirect URLs:** add `https://projects.oriongroup.com.mt/**`. While testing on Vercel, also add `https://*.vercel.app/**`.
2. **Sign In / Providers → Email**
   - **Enable Email provider:** on
   - **Confirm email:** **on**. New users must click the link in their email before they can sign in.
   - **Minimum password length:** 8
3. **Emails → Templates.** For each template below, paste the subject, then paste the whole file from `supabase/templates/` into the message body (in GitHub, open the file → **Raw** → copy all):

   | Template | Subject | File |
   |---|---|---|
   | Confirm signup | Confirm your email for Orion Projects | `confirmation.html` |
   | Invite user | You're invited to Orion Projects | `invite.html` |
   | Reset password | Reset your Orion Projects password | `recovery.html` |
   | Change email address | Confirm your new email for Orion Projects | `email_change.html` |
   | Magic link | Your Orion Projects sign-in link | `magic_link.html` |

   The templates show the Orion logo from `/brand/orion-mark.png` on your site. To use the official logo, replace `public/brand/orion-mark.png` and `public/brand/orion-mark.svg`.

---

## 5. Send email from your own domain (SMTP)

Supabase's built-in email only sends a few emails per hour and is meant for testing. For real use, connect an email service. These steps use **Resend**; Postmark, Brevo or Microsoft 365 work the same way.

1. Create an account at **resend.com**.
2. **Domains → Add domain.** Use a sub-domain such as `mail.oriongroup.com.mt`.
3. Resend shows 3–4 **DNS records**. Send them to whoever manages your DNS and ask them to add them. Wait until Resend shows **Verified** (minutes to a few hours).
4. **API Keys → Create API key** (permission: *Sending access*). Copy it.
5. In Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - **Sender email:** `noreply@mail.oriongroup.com.mt`
   - **Sender name:** `Orion Projects`
   - **Host:** `smtp.resend.com`  **Port:** `465`
   - **Username:** `resend`  **Password:** the API key from step 4
6. **Authentication → Rate Limits:** raise *emails sent per hour* to something like 100.
7. Test it: sign up with your own email address on the app. The email should come from your domain.

---

## 6. Turn on "Sign in with Google"

1. Go to **console.cloud.google.com** and create a project called `Orion Projects` (top-left project picker → *New project*).
2. **APIs & Services → OAuth consent screen** (also called *Google Auth Platform*):
   - **User type:** choose **External** so anyone with a Google or Gmail account can use it. New accounts still need your approval in the app.
     (Choose **Internal** instead if you only want `@oriongroup.com.mt` Google Workspace accounts.)
   - **App name:** Orion Projects. **Support email:** yours. Upload the logo if you like.
   - **Authorised domains:** `oriongroup.com.mt` and `supabase.co`
   - Scopes: the defaults (`email`, `profile`, `openid`) are all that's needed.
   - Click **Publish app** so it isn't limited to test users.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type:** Web application
   - **Authorised JavaScript origins:** `https://projects.oriongroup.com.mt`
   - **Authorised redirect URIs:** `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`. Supabase shows this exact address on its Google provider page, so copy it from there.
   - Click **Create**, then copy the **Client ID** and **Client secret**.
4. In Supabase: **Authentication → Sign In / Providers → Google**: turn it on, paste the Client ID and Client secret, and click **Save**.

---

## 7. Put the app online with Vercel

1. Go to **vercel.com** → **Add New… → Project** → import the `Orion-Project-Management-` GitHub repository.
2. Before clicking Deploy, open **Environment Variables** and add these. The names must match exactly; the values come from your notepad:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
   | `SUPABASE_SECRET_KEY` | Supabase secret key |
   | `NEXT_PUBLIC_SITE_URL` | `https://projects.oriongroup.com.mt` (no `/` at the end) |
   | `BOOTSTRAP_ADMIN_EMAIL` | Your own email address (see step 8) |

3. Click **Deploy** and wait about 2 minutes.
4. **Your own address:** go to **Project → Settings → Domains → Add**, type `projects.oriongroup.com.mt`, and give the DNS record Vercel shows (usually a `CNAME` to `cname.vercel-dns.com`) to whoever manages your DNS.
5. If you change an environment variable later, go to **Deployments → ⋯ → Redeploy** for it to take effect.

---

## 8. Become the first Administrator

1. Make sure `BOOTSTRAP_ADMIN_EMAIL` on Vercel is **your** email.
2. Open the app and either **Continue with Google** with that address, or **Create an account** with it and click the confirmation email.
3. You're signed in as **Administrator**. This only happens while there is no Administrator, so it's safe to leave the variable set.

---

## 9. Everyday admin tasks

Open **Admin**. It's in the sidebar on a computer, and under **Profile → Admin** on a phone.

- **Approve new people:** anyone who signs up waits on a "Waiting for approval" screen. Choose their level and tap **Approve**. Tap ✕ to decline.
- **Invite someone:** enter their email and level, then tap **Send invite**. They get an email, choose a password, and can start straight away with no approval step. Invitations last 14 days.
- **Change a level:** use the drop-down next to the person's name.
- **Deactivate:** blocks sign-in immediately and hides all data from that person. **Reactivate** restores them.
- **Settings:** choose whether *Basic* users may write in project chats.

---

## 10. Who can do what

These rules are enforced by the **database itself**, not only by hiding buttons, so they can't be bypassed.

| Level | Can do |
|---|---|
| **Administrator** | Everything: settings, users and levels, all projects, management chat, delete anything |
| **Manager** | Create and edit all projects, assign people, Gantt charts and client exports, management chat |
| **Technician** | Work only on projects they're assigned to: update tasks, post daily updates and photos, project chat |
| **Basic** | Read-only on assigned projects. Can read chats, and can write in them only if an admin allows it |

Other rules:

- People waiting for approval, and deactivated people, can see **nothing** except their own profile.
- Technicians can edit or delete their own daily update for 24 hours after posting it.
- Technicians can create and update tasks but not delete them. They can add or remove only **themselves** as a task owner.
- All files and photos are private and are only shown through short-lived links.

---

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| "That link is invalid or has expired" | Links work once and expire after 1 hour. Request a new one. Also check the **Site URL** and **Redirect URLs** in step 4. |
| Confirmation emails don't arrive | Check spam. Check SMTP (step 5) and that the domain is *Verified*. Supabase → **Logs → Auth** shows email errors. |
| Google sign-in says "redirect_uri_mismatch" | The redirect URI in Google (step 6.3) must exactly match the one shown on Supabase's Google provider page. |
| Google sign-in goes back to localhost | Fix the **Site URL** in Supabase (step 4.1) and `NEXT_PUBLIC_SITE_URL` on Vercel. Then redeploy. |
| "Missing environment variables" error page | An environment variable is missing on Vercel (step 7). Add it and redeploy. |
| I'm stuck on "Waiting for approval" as the first user | `BOOTSTRAP_ADMIN_EMAIL` doesn't match your email, or someone else is already Administrator. As a last resort, in Supabase **SQL Editor** run: `update profiles set role='admin', status='active' where email='you@example.com';` |
| An invited person signed in with Google and is waiting for approval | Ask them to use the link in the invitation email first. Or just approve them in Admin. |

---

## 12. For developers

### Tech stack

- **Next.js 16** (App Router, TypeScript, Server Actions). The request interceptor is `src/proxy.ts`, since Next 16 renamed middleware to "proxy".
- **Tailwind CSS 4** with shadcn/ui-style components in `src/components/ui`, written in-repo. Icons from `lucide-react`. Light and dark mode via `next-themes`.
- **Supabase**: Postgres with Row Level Security on every table, Auth, private Storage and Realtime. Cookie sessions via `@supabase/ssr`.
- **Zod** validation on every server action. Postgres-backed rate limiting for sign-in, sign-up, password reset, invites and uploads.

Cache Components is turned off on purpose: every screen depends on who is signed in.

### Run it locally

You need Node 22+ and Docker (for the local Supabase).

```bash
npm install
cp .env.example .env.local      # then fill in values from `npx supabase status`
npx supabase start              # local Postgres, Auth, Storage, plus email inbox at http://localhost:54324
npx supabase db reset           # applies migrations + demo seed
npm run dev                     # http://localhost:3000
```

Demo accounts (local only, password `OrionDemo!2026`): `admin@orion.test`, `manager@orion.test`, `tech1@orion.test`, `tech2@orion.test`, `basic@orion.test`, `pending@orion.test`.

### Tests

| Command | What it checks |
|---|---|
| `npm run test:unit` | Utilities, validation, permission helpers |
| `npm run test:rls` | **Row Level Security for every level.** For example: a Technician can't read an unassigned project; Basic can't write; pending users see nothing; only admins approve. Runs against the local Supabase (`supabase db reset` first), or against any **empty** Postgres 15+ with `RLS_DATABASE_URL=postgresql://…`, using a small Supabase shim in `tests/rls/supabase-shim.sql`. This is how CI runs it, with no Docker needed. |
| `npm run test:e2e` | Playwright on a phone and a desktop viewport. Specs tagged `@supabase` also need `E2E_SUPABASE=1` and a seeded local Supabase. |
| `npm run lint` / `npm run typecheck` | Code style and types |

### Folder structure

```
supabase/
  migrations/      SQL: tables, triggers, RLS policies, storage buckets (one file per area)
  seed.sql         demo users and 2 demo projects (local and testing only)
  templates/       branded auth emails
  config.toml      local Supabase CLI settings
src/
  proxy.ts         refreshes the session and sends signed-out visitors to /login
  app/
    (auth)/        login, signup, check-email, forgot-password, plus server actions
    auth/          callback (Google), confirm (email links), set-password, signout
    pending/       waiting-for-approval / deactivated screen
    (app)/         signed-in area: home, projects, daily-update, chats, profile, admin
  components/      ui/ (design system), layout/ (sidebar, bottom tabs), auth/, admin/, profile/
  lib/
    supabase/      browser, server, proxy and admin (secret-key) clients
    auth/          session helpers, roles, first-admin bootstrap
    validation/    Zod schemas shared by forms and server actions
  types/database.ts
tests/
  unit/  rls/  e2e/
```

### Security model

- Permission helpers live in the private `app` schema (`app.is_admin()`, `app.can_view_project(id)`, `app.can_edit_project(id)`, `app.can_post_channel(id)` and others). Every policy calls them, and they all return *false* for pending or deactivated users.
- A trigger (`app.guard_profile_update`) stops anyone except an Administrator from changing a level, status or email, including their own. Administrators can't demote themselves.
- New sign-ups are `pending`. Emails with an open invitation are activated at the invited level by the `app.handle_new_user` trigger.
- The secret key is only used server-side, in `src/lib/supabase/admin.ts`, after a role check. It's used for invites, banning deactivated accounts and the rate limiter.
