import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";


/**
 * Database used by the RLS tests.
 * - With the Supabase CLI running locally (`supabase start` + `supabase db reset`)
 *   the default URL already has migrations + seed applied.
 * - Against a plain, EMPTY Postgres (CI, no Docker) we apply a small Supabase
 *   shim, then all migrations and the seed. Never point this at production.
 */
export const DATABASE_URL =
  process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const root = path.resolve(__dirname, "../..");

export const USERS = {
  admin: "00000000-0000-4000-8000-000000000001",
  manager: "00000000-0000-4000-8000-000000000002",
  tech1: "00000000-0000-4000-8000-000000000003",
  tech2: "00000000-0000-4000-8000-000000000004",
  basic: "00000000-0000-4000-8000-000000000005",
  pending: "00000000-0000-4000-8000-000000000006",
} as const;

export const PROJECTS = {
  valletta: "20000000-0000-4000-8000-000000000001", // tech1 + basic are members
  mosta: "20000000-0000-4000-8000-000000000002", // tech2 is a member
} as const;

export const GROUPS = {
  vallettaInProgress: "30000000-0000-4000-8000-000000000002",
  mostaInstall: "30000000-0000-4000-8000-000000000005",
} as const;

export const TASKS = {
  vallettaPartitions: "40000000-0000-4000-8000-000000000003",
  mostaRails: "40000000-0000-4000-8000-000000000008",
} as const;

export async function prepareDatabase() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select
         exists (select 1 from information_schema.schemata where schema_name = 'auth') as has_auth,
         to_regclass('public.profiles') is not null as has_profiles`,
    );
    const { has_auth, has_profiles } = rows[0];
    if (has_profiles) return;
    if (!has_auth) {
      await client.query(readFileSync(path.join(root, "tests/rls/supabase-shim.sql"), "utf8"));
    }
    const dir = path.join(root, "supabase/migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await client.query(readFileSync(path.join(dir, file), "utf8"));
    }
    await client.query(readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));
  } finally {
    await client.end();
  }
}

export type Db = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  /** Runs SQL and returns the Postgres error message, or null if it succeeded. */
  fails: (sql: string, params?: unknown[]) => Promise<string | null>;
};

/**
 * Runs `fn` inside a transaction impersonating a user exactly the way
 * Supabase's API does (role `authenticated` + JWT claims). Always rolled back.
 * Pass `null` to act as an anonymous visitor.
 */
export async function asUser(userId: string | null, fn: (db: Db) => Promise<void>) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    const role = userId ? "authenticated" : "anon";
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ]);
    let n = 0;
    const db: Db = {
      query: async (sql, params) => (await client.query(sql, params)).rows,
      fails: async (sql, params) => {
        const sp = `sp${n++}`;
        await client.query(`savepoint ${sp}`);
        try {
          await client.query(sql, params);
          await client.query(`release savepoint ${sp}`);
          return null;
        } catch (e) {
          await client.query(`rollback to savepoint ${sp}`);
          return (e as Error).message;
        }
      },
    };
    await fn(db);
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

/** Runs setup SQL as the database owner inside the same rolled-back transaction, then impersonates. */
export async function withSetup(setupSql: string, userId: string, fn: (db: Db) => Promise<void>) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(setupSql);
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    let n = 0;
    await fn({
      query: async (sql, params) => (await client.query(sql, params)).rows,
      fails: async (sql, params) => {
        const sp = `sp${n++}`;
        await client.query(`savepoint ${sp}`);
        try {
          await client.query(sql, params);
          await client.query(`release savepoint ${sp}`);
          return null;
        } catch (e) {
          await client.query(`rollback to savepoint ${sp}`);
          return (e as Error).message;
        }
      },
    });
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}
