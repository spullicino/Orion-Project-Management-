<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Orion Projects — notes for contributors

- Permissions are enforced in Postgres (RLS). Any new table needs `enable row level security` and policies using the `app.*` helpers, plus cases in `tests/rls/rls.test.ts`.
- Migrations are append-only: add a new file in `supabase/migrations/`, never edit one already applied to production.
- Server actions validate with Zod (`src/lib/validation`) and call `requireActiveProfile()` / `requireRole()` first.
- `src/lib/supabase/admin.ts` bypasses RLS — only use after an explicit role check.
- Mobile-first: touch targets ≥ 44px (`h-11`), 16px inputs on phones, bottom tab bar below `md`.
