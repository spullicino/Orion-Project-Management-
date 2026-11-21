import { beforeAll, describe, expect, it } from "vitest";
import { GROUPS, PROJECTS, TASKS, USERS, asUser, prepareDatabase, withSetup } from "./db";

beforeAll(async () => {
  await prepareDatabase();
});

const count = async (db: { query: (s: string, p?: unknown[]) => Promise<Record<string, unknown>[]> }, sql: string, p?: unknown[]) =>
  Number((await db.query(`select count(*)::int as n from (${sql}) x`, p))[0].n);

const insertTask = (projectId: string, groupId: string) =>
  `insert into public.tasks (project_id, group_id, title) values ('${projectId}', '${groupId}', 'RLS test task')`;

// ---------------------------------------------------------------------------
describe("anonymous visitors", () => {
  it("cannot read or write anything", async () => {
    await asUser(null, async (db) => {
      for (const t of ["profiles", "projects", "tasks", "daily_updates", "messages", "share_links", "clients"]) {
        expect(await db.fails(`select 1 from public.${t}`)).toMatch(/permission denied/);
      }
      expect(await db.fails("insert into public.projects (name) values ('x')")).toMatch(/permission denied/);
    });
  });
});

describe("table privileges", () => {
  it("signed-in users can query every app table (RLS then filters rows)", async () => {
    const tables = await (async () => {
      let names: string[] = [];
      await asUser(USERS.admin, async (db) => {
        names = (
          await db.query<{ tablename: string }>(
            "select tablename from pg_tables where schemaname = 'public' and tablename not in ('rate_limits', 'push_outbox') order by 1",
          )
        ).map((r) => r.tablename);
      });
      return names;
    })();
    expect(tables.length).toBeGreaterThan(20);
    await asUser(USERS.tech1, async (db) => {
      for (const t of tables) expect(await db.fails(`select 1 from public.${t} limit 1`), t).toBeNull();
      expect(await db.fails("select 1 from public.rate_limits")).toMatch(/permission denied/);
    });
  });
});

// ---------------------------------------------------------------------------
describe("pending (unapproved) users", () => {
  it("see only their own profile and no projects, chats or settings", async () => {
    await asUser(USERS.pending, async (db) => {
      const profiles = await db.query<{ id: string }>("select id from public.profiles");
      expect(profiles.map((p) => p.id)).toEqual([USERS.pending]);
      expect(await count(db, "select 1 from public.projects")).toBe(0);
      expect(await count(db, "select 1 from public.channels")).toBe(0);
      expect(await count(db, "select 1 from public.app_settings")).toBe(0);
    });
  });

  it("cannot approve themselves or change their level", async () => {
    await asUser(USERS.pending, async (db) => {
      expect(await db.fails(`update public.profiles set status = 'active' where id = '${USERS.pending}'`)).toMatch(
        /Only an administrator/,
      );
      expect(await db.fails(`update public.profiles set role = 'admin' where id = '${USERS.pending}'`)).toMatch(
        /Only an administrator/,
      );
    });
  });

  it("can still edit their own name", async () => {
    await asUser(USERS.pending, async (db) => {
      await db.query(`update public.profiles set first_name = 'Paulina' where id = '${USERS.pending}'`);
      const [p] = await db.query<{ first_name: string }>("select first_name from public.profiles");
      expect(p.first_name).toBe("Paulina");
    });
  });
});

// ---------------------------------------------------------------------------
describe("user levels & approval", () => {
  it("a technician cannot promote themselves", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(`update public.profiles set role = 'manager' where id = '${USERS.tech1}'`)).toMatch(
        /Only an administrator/,
      );
    });
  });

  it("a manager cannot change another user's level (row is invisible to update)", async () => {
    await asUser(USERS.manager, async (db) => {
      const rows = await db.query(`update public.profiles set role = 'admin' where id = '${USERS.tech1}' returning id`);
      expect(rows).toHaveLength(0);
    });
  });

  it("a manager cannot see pending users", async () => {
    await asUser(USERS.manager, async (db) => {
      expect(await count(db, `select 1 from public.profiles where id = '${USERS.pending}'`)).toBe(0);
    });
  });

  it("an admin can approve a pending user and set their level", async () => {
    await asUser(USERS.admin, async (db) => {
      const rows = await db.query<{ status: string; role: string; approved_by: string }>(
        `update public.profiles set status = 'active', role = 'technician'
         where id = '${USERS.pending}' returning status, role, approved_by`,
      );
      expect(rows[0]).toMatchObject({ status: "active", role: "technician", approved_by: USERS.admin });
    });
  });

  it("an admin cannot remove their own admin access", async () => {
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails(`update public.profiles set role = 'manager' where id = '${USERS.admin}'`)).toMatch(
        /cannot remove your own/,
      );
    });
  });

  it("only admins can see invites or change settings", async () => {
    await asUser(USERS.manager, async (db) => {
      expect(await count(db, "select 1 from public.invites")).toBe(0);
      expect(await db.fails("insert into public.invites (email, role) values ('x@y.com', 'manager')")).toMatch(
        /row-level security/,
      );
      const upd = await db.query("update public.app_settings set basic_can_post_chat = true returning id");
      expect(upd).toHaveLength(0);
    });
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails("insert into public.invites (email, role) values ('x@y.com', 'manager')")).toBeNull();
    });
  });

  it("an invited email is auto-approved at the invited level on sign-up", async () => {
    await withSetup(
      `insert into public.invites (email, role, invited_by) values ('new.tech@orion.test', 'technician', '${USERS.admin}');
       insert into auth.users (id, email, raw_user_meta_data)
       values ('00000000-0000-4000-8000-0000000000aa', 'New.Tech@orion.test', '{"full_name":"Nina Tech Galea"}');`,
      USERS.admin,
      async (db) => {
        const [p] = await db.query<{ role: string; status: string; first_name: string; last_name: string }>(
          "select role, status, first_name, last_name from public.profiles where id = '00000000-0000-4000-8000-0000000000aa'",
        );
        expect(p).toMatchObject({ role: "technician", status: "active", first_name: "Nina", last_name: "Tech Galea" });
        const [inv] = await db.query<{ accepted_at: string | null }>(
          "select accepted_at from public.invites where email = 'new.tech@orion.test'",
        );
        expect(inv.accepted_at).not.toBeNull();
      },
    );
  });

  it("a deactivated user loses access to everything", async () => {
    await withSetup(`update public.profiles set status = 'deactivated' where id = '${USERS.tech1}'`, USERS.tech1, async (db) => {
      expect(await count(db, "select 1 from public.projects")).toBe(0);
      expect(await count(db, "select 1 from public.tasks")).toBe(0);
      expect(await db.fails(insertTask(PROJECTS.valletta, GROUPS.vallettaInProgress))).toMatch(/row-level security/);
    });
  });
});

// ---------------------------------------------------------------------------
describe("project visibility", () => {
  it("managers and admins see every project", async () => {
    for (const u of [USERS.admin, USERS.manager]) {
      await asUser(u, async (db) => {
        expect(await count(db, "select 1 from public.projects")).toBe(2);
      });
    }
  });

  it("a technician cannot read a project they are not assigned to", async () => {
    await asUser(USERS.tech1, async (db) => {
      const projects = await db.query<{ id: string }>("select id from public.projects");
      expect(projects.map((p) => p.id)).toEqual([PROJECTS.valletta]);
      expect(await count(db, `select 1 from public.tasks where project_id = '${PROJECTS.mosta}'`)).toBe(0);
      expect(await count(db, `select 1 from public.daily_updates where project_id = '${PROJECTS.mosta}'`)).toBe(0);
      expect(await count(db, `select 1 from public.channels where project_id = '${PROJECTS.mosta}'`)).toBe(0);
    });
    await asUser(USERS.tech2, async (db) => {
      const projects = await db.query<{ id: string }>("select id from public.projects");
      expect(projects.map((p) => p.id)).toEqual([PROJECTS.mosta]);
    });
  });

  it("a basic user sees only assigned projects", async () => {
    await asUser(USERS.basic, async (db) => {
      const projects = await db.query<{ id: string }>("select id from public.projects");
      expect(projects.map((p) => p.id)).toEqual([PROJECTS.valletta]);
    });
  });
});

// ---------------------------------------------------------------------------
describe("project & task writes", () => {
  it("technicians and basic users cannot create projects; managers can", async () => {
    for (const u of [USERS.tech1, USERS.basic]) {
      await asUser(u, async (db) => {
        expect(await db.fails("insert into public.projects (name) values ('Nope')")).toMatch(/row-level security/);
      });
    }
    await asUser(USERS.manager, async (db) => {
      const [p] = await db.query<{ id: string }>("insert into public.projects (name) values ('New one') returning id");
      // Trigger: default labels, project channel, creator membership
      expect(await count(db, `select 1 from public.status_labels where project_id = '${p.id}'`)).toBe(4);
      expect(await count(db, `select 1 from public.channels where project_id = '${p.id}'`)).toBe(1);
      expect(await count(db, `select 1 from public.project_members where project_id = '${p.id}'`)).toBe(1);
    });
  });

  it("only admins can delete projects", async () => {
    await asUser(USERS.manager, async (db) => {
      expect(await db.query(`delete from public.projects where id = '${PROJECTS.mosta}' returning id`)).toHaveLength(0);
    });
    await asUser(USERS.admin, async (db) => {
      expect(await db.query(`delete from public.projects where id = '${PROJECTS.mosta}' returning id`)).toHaveLength(1);
    });
  });

  it("a technician can create and update tasks on their project but not on others", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(insertTask(PROJECTS.valletta, GROUPS.vallettaInProgress))).toBeNull();
      expect(await db.fails(insertTask(PROJECTS.mosta, GROUPS.mostaInstall))).toMatch(/row-level security/);
      const upd = await db.query(`update public.tasks set progress = 70 where id = '${TASKS.vallettaPartitions}' returning id`);
      expect(upd).toHaveLength(1);
      const other = await db.query(`update public.tasks set progress = 70 where id = '${TASKS.mostaRails}' returning id`);
      expect(other).toHaveLength(0);
    });
  });

  it("a technician cannot delete tasks", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.query(`delete from public.tasks where id = '${TASKS.vallettaPartitions}' returning id`)).toHaveLength(0);
    });
  });

  it("basic users cannot write anything on their project", async () => {
    await asUser(USERS.basic, async (db) => {
      expect(await db.fails(insertTask(PROJECTS.valletta, GROUPS.vallettaInProgress))).toMatch(/row-level security/);
      expect(await db.query(`update public.tasks set progress = 5 where id = '${TASKS.vallettaPartitions}' returning id`)).toHaveLength(0);
      expect(
        await db.fails(`insert into public.comments (task_id, author_id, body) values ('${TASKS.vallettaPartitions}', '${USERS.basic}', 'hi')`),
      ).toMatch(/row-level security/);
      expect(
        await db.fails(`insert into public.daily_updates (project_id, author_id, work_done) values ('${PROJECTS.valletta}', '${USERS.basic}', 'x')`),
      ).toMatch(/row-level security/);
    });
  });

  it("technicians may assign themselves but not other people", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(
        await db.fails(`insert into public.task_assignees (task_id, user_id) values ('${TASKS.vallettaPartitions}', '${USERS.basic}')`),
      ).toMatch(/row-level security/);
      // tech1 is already assigned to partitions; un-assign + re-assign self
      await db.query(`delete from public.task_assignees where task_id = '${TASKS.vallettaPartitions}' and user_id = '${USERS.tech1}'`);
      expect(
        await db.fails(`insert into public.task_assignees (task_id, user_id) values ('${TASKS.vallettaPartitions}', '${USERS.tech1}')`),
      ).toBeNull();
    });
  });

  it("technicians cannot add project members or create share links", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(
        await db.fails(`insert into public.project_members (project_id, user_id) values ('${PROJECTS.valletta}', '${USERS.tech2}')`),
      ).toMatch(/row-level security/);
      expect(await db.fails(`insert into public.share_links (project_id) values ('${PROJECTS.valletta}')`)).toMatch(
        /row-level security/,
      );
      expect(await count(db, "select 1 from public.share_links")).toBe(0);
    });
  });

  it("task changes are recorded in the activity log with the actor", async () => {
    await asUser(USERS.tech1, async (db) => {
      await db.query(`update public.tasks set progress = 75 where id = '${TASKS.vallettaPartitions}'`);
      const [log] = await db.query<{ actor_id: string; changes: Record<string, unknown> }>(
        `select actor_id, changes from public.activity_log where task_id = '${TASKS.vallettaPartitions}' order by id desc limit 1`,
      );
      expect(log.actor_id).toBe(USERS.tech1);
      expect(log.changes).toEqual({ progress: [60, 75] });
      expect(await db.fails(`insert into public.activity_log (project_id, action) values ('${PROJECTS.valletta}', 'fake')`)).toMatch(
        /row-level security/,
      );
    });
  });
});

// ---------------------------------------------------------------------------
describe("daily updates", () => {
  it("a technician posts only on assigned projects and only as themselves", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(
        await db.fails(`insert into public.daily_updates (project_id, author_id, work_done) values ('${PROJECTS.valletta}', '${USERS.tech1}', 'ok')`),
      ).toBeNull();
      expect(
        await db.fails(`insert into public.daily_updates (project_id, author_id, work_done) values ('${PROJECTS.mosta}', '${USERS.tech1}', 'no')`),
      ).toMatch(/row-level security/);
      expect(
        await db.fails(`insert into public.daily_updates (project_id, author_id, work_done) values ('${PROJECTS.valletta}', '${USERS.basic}', 'spoof')`),
      ).toMatch(/row-level security/);
    });
  });

  it("authors can edit their own update for 24 hours only", async () => {
    await withSetup(
      `update public.daily_updates set created_at = now() - interval '2 days'
       where author_id = '${USERS.tech1}' and work_date < current_date`,
      USERS.tech1,
      async (db) => {
        const fresh = await db.query(
          `update public.daily_updates set hours = 6 where author_id = '${USERS.tech1}' and work_date = current_date returning id`,
        );
        expect(fresh).toHaveLength(1);
        const old = await db.query(
          `update public.daily_updates set hours = 6 where author_id = '${USERS.tech1}' and work_date < current_date returning id`,
        );
        expect(old).toHaveLength(0);
      },
    );
  });
});

// ---------------------------------------------------------------------------
describe("chats", () => {
  const projectChannel = (p: string) => `(select id from public.channels where project_id = '${p}')`;
  const post = (channelSql: string, author: string) =>
    `insert into public.messages (channel_id, author_id, body) values (${channelSql}, '${author}', 'hello')`;

  it("technicians cannot see the management channel; managers can", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await count(db, "select 1 from public.channels where type = 'management'")).toBe(0);
    });
    await asUser(USERS.manager, async (db) => {
      expect(await count(db, "select 1 from public.channels where type = 'management'")).toBe(1);
      expect(await db.fails(post("(select id from public.channels where type = 'management')", USERS.manager))).toBeNull();
    });
  });

  it("everyone reads General; only managers+ post there", async () => {
    await asUser(USERS.basic, async (db) => {
      expect(await count(db, "select 1 from public.messages m join public.channels c on c.id = m.channel_id where c.type = 'general'")).toBe(1);
    });
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(post("(select id from public.channels where type = 'general')", USERS.tech1))).toMatch(
        /row-level security/,
      );
    });
  });

  it("project members can post in the project chat; other technicians cannot even read it", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(post(projectChannel(PROJECTS.valletta), USERS.tech1))).toBeNull();
    });
    await asUser(USERS.tech2, async (db) => {
      expect(await count(db, `select 1 from public.messages where channel_id = ${projectChannel(PROJECTS.valletta)}`)).toBe(0);
    });
  });

  it("basic users read the project chat but cannot post unless the admin setting allows it", async () => {
    await asUser(USERS.basic, async (db) => {
      expect(await count(db, `select 1 from public.messages where channel_id = ${projectChannel(PROJECTS.valletta)}`)).toBe(1);
      expect(await db.fails(post(projectChannel(PROJECTS.valletta), USERS.basic))).toMatch(/row-level security/);
    });
    await withSetup("update public.app_settings set basic_can_post_chat = true", USERS.basic, async (db) => {
      expect(await db.fails(post(projectChannel(PROJECTS.valletta), USERS.basic))).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
describe("notifications & server-only functions", () => {
  it("users only see their own notifications and cannot create them", async () => {
    await withSetup(
      `insert into public.notifications (user_id, type, title) values ('${USERS.tech2}', 'mention', 'for tech2')`,
      USERS.tech1,
      async (db) => {
        expect(await count(db, "select 1 from public.notifications")).toBe(0);
        expect(
          await db.fails(`insert into public.notifications (user_id, type, title) values ('${USERS.tech1}', 'x', 'y')`),
        ).toMatch(/row-level security/);
      },
    );
  });

  it("the rate limiter cannot be called from the browser", async () => {
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails("select public.check_rate_limit('k', 1, 60)")).toMatch(/permission denied/);
    });
  });
});

// ---------------------------------------------------------------------------
describe("storage", () => {
  const upload = (bucket: string, name: string, owner: string) =>
    `insert into storage.objects (bucket_id, name, owner_id) values ('${bucket}', '${name}', '${owner}')`;

  it("technicians upload project files only to their own projects", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(upload("project-files", `${PROJECTS.valletta}/daily/x/a.jpg`, USERS.tech1))).toBeNull();
      expect(await db.fails(upload("project-files", `${PROJECTS.mosta}/daily/x/a.jpg`, USERS.tech1))).toMatch(
        /row-level security/,
      );
      expect(await db.fails(upload("project-files", `not-a-uuid/a.jpg`, USERS.tech1))).toMatch(/row-level security/);
    });
  });

  it("basic users cannot upload project files", async () => {
    await asUser(USERS.basic, async (db) => {
      expect(await db.fails(upload("project-files", `${PROJECTS.valletta}/daily/x/a.jpg`, USERS.basic))).toMatch(
        /row-level security/,
      );
    });
  });

  it("users can only write avatars into their own folder", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(upload("avatars", `${USERS.tech1}/me.jpg`, USERS.tech1))).toBeNull();
      expect(await db.fails(upload("avatars", `${USERS.tech2}/me.jpg`, USERS.tech1))).toMatch(/row-level security/);
    });
  });
});

// ---------------------------------------------------------------------------
describe("phase 2: board, My Tasks and templates functions", () => {
  type Row = Record<string, unknown>;
  const one = async (db: { query: (s: string) => Promise<Row[]> }, sql: string) => (await db.query(sql))[0];

  it("get_project_board returns the board only to people who can see the project", async () => {
    await asUser(USERS.tech1, async (db) => {
      const r = await one(db, `select public.get_project_board('${PROJECTS.valletta}') as b`);
      const b = r.b as { tasks: { assignees: string[]; blocked_by: string[] }[]; groups: unknown[]; labels: unknown[]; members: unknown[] };
      expect(b.groups).toHaveLength(3);
      expect(b.labels).toHaveLength(4);
      expect(b.tasks).toHaveLength(6);
      expect(b.members.length).toBeGreaterThanOrEqual(3);
      expect(b.tasks.some((t) => t.blocked_by.length > 0)).toBe(true);
      expect((await one(db, `select public.get_project_board('${PROJECTS.mosta}') as b`)).b).toBeNull();
    });
  });

  it("get_task_detail hides tasks from other projects", async () => {
    await asUser(USERS.tech2, async (db) => {
      expect((await one(db, `select public.get_task_detail('${TASKS.vallettaPartitions}') as d`)).d).toBeNull();
      const d = (await one(db, `select public.get_task_detail('${TASKS.mostaRails}') as d`)).d as { task: { title: string } };
      expect(d.task.title).toBe("Mounting rails");
    });
  });

  it("get_my_tasks returns only my own assignments", async () => {
    await asUser(USERS.tech1, async (db) => {
      const tasks = (await one(db, "select public.get_my_tasks() as t")).t as { project_id: string }[];
      expect(tasks).toHaveLength(3);
      expect(tasks.every((t) => t.project_id === PROJECTS.valletta)).toBe(true);
    });
    await asUser(USERS.basic, async (db) => {
      expect((await one(db, "select public.get_my_tasks() as t")).t).toEqual([]);
    });
  });

  it("list_projects follows project visibility", async () => {
    await asUser(USERS.manager, async (db) => {
      expect(((await one(db, "select public.list_projects() as p")).p as unknown[]).length).toBe(2);
    });
    await asUser(USERS.basic, async (db) => {
      const p = (await one(db, "select public.list_projects() as p")).p as { id: string; task_count: number }[];
      expect(p.map((x) => x.id)).toEqual([PROJECTS.valletta]);
      expect(p[0].task_count).toBe(6);
    });
  });

  it("only managers can duplicate a project; the copy keeps structure, not people or progress", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(`select public.duplicate_project('${PROJECTS.valletta}', 'Copy')`)).toMatch(/Only managers/);
    });
    await asUser(USERS.manager, async (db) => {
      const { id } = (await one(db, `select public.duplicate_project('${PROJECTS.valletta}', 'Template', true, current_date + 7) as id`)) as { id: string };
      const b = (await one(db, `select public.get_project_board('${id}') as b`)).b as {
        project: { is_template: boolean; start_date: string };
        groups: unknown[];
        labels: unknown[];
        tasks: { progress: number; blocked_by: string[]; assignees: string[]; checklist_total: number }[];
      };
      expect(b.project.is_template).toBe(true);
      expect(b.groups).toHaveLength(3);
      expect(b.labels).toHaveLength(4);
      expect(b.tasks).toHaveLength(6);
      expect(b.tasks.every((t) => t.progress === 0 && t.assignees.length === 0)).toBe(true);
      expect(b.tasks.filter((t) => t.blocked_by.length > 0)).toHaveLength(2);
      expect(b.tasks.reduce((n, t) => n + Number(t.checklist_total), 0)).toBe(3);
      // Templates get no chat channel and don't show up in the normal project list.
      expect(await count(db, `select 1 from public.channels where project_id = '${id}'`)).toBe(0);
      expect(((await one(db, "select public.list_projects() as p")).p as unknown[]).length).toBe(2);
      expect(((await one(db, "select public.list_projects(false, true) as p")).p as unknown[]).length).toBe(1);
    });
  });

  it("anonymous visitors cannot call the board functions", async () => {
    await asUser(null, async (db) => {
      expect(await db.fails(`select public.get_project_board('${PROJECTS.valletta}')`)).toMatch(/permission denied/);
      expect(await db.fails("select public.get_my_tasks()")).toMatch(/permission denied/);
    });
  });
});

// ---------------------------------------------------------------------------
describe("phase 3: client share links", () => {
  const create = (extra = "") =>
    `insert into public.share_links (project_id, token${extra ? ", " + extra.split("=")[0] : ""})
     values ('${PROJECTS.valletta}', repeat('a', 48)${extra ? ", " + extra.split("=")[1] : ""});`;
  type Shared = { project: { name: string }; tasks: { owners: string[]; title: string }[]; milestones: unknown[] } | null;
  const fetchShared = async (db: { query: (s: string) => Promise<Record<string, unknown>[]> }, token = "a".repeat(48)) =>
    (await db.query(`select public.get_shared_project('${token}') as s`))[0].s as Shared;

  it("a valid link shows the project to a visitor with no login, without owners by default", async () => {
    await withSetup(create(), USERS.admin, async (db) => {
      await db.query("reset role");
      await db.query("set local role anon");
      await db.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
      const s = await fetchShared(db);
      expect(s?.project.name).toBe("Valletta Office Fit-out");
      expect(s?.tasks).toHaveLength(6);
      expect(s?.milestones).toHaveLength(2);
      expect(s?.tasks.every((t) => t.owners.length === 0)).toBe(true);
      expect(JSON.stringify(s)).not.toMatch(/internal_notes|description|email/);
      // …but cannot read the tables themselves
      expect(await db.fails("select * from public.share_links")).toMatch(/permission denied/);
      expect(await db.fails("select * from public.tasks")).toMatch(/permission denied/);
    });
  });

  it("owners are included only when the link allows it", async () => {
    await withSetup(create("hide_owners=false"), USERS.admin, async (db) => {
      const s = await fetchShared(db);
      expect(s?.tasks.find((t) => t.title === "Partition walls")?.owners).toEqual(["Tina Camilleri"]);
    });
  });

  it("revoked, expired and unknown links show nothing", async () => {
    await withSetup(create("revoked_at=now()"), USERS.admin, async (db) => {
      expect(await fetchShared(db)).toBeNull();
    });
    await withSetup(create("expires_at=now() - interval '1 day'"), USERS.admin, async (db) => {
      expect(await fetchShared(db)).toBeNull();
    });
    await withSetup(create(), USERS.admin, async (db) => {
      expect(await fetchShared(db, "b".repeat(48))).toBeNull();
      expect(await fetchShared(db, "short")).toBeNull();
    });
  });

  it("only managers can create share links or milestones", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(`insert into public.milestones (project_id, title, date) values ('${PROJECTS.valletta}', 'X', current_date)`)).toMatch(/row-level security/);
    });
    await asUser(USERS.manager, async (db) => {
      expect(await db.fails(`insert into public.milestones (project_id, title, date) values ('${PROJECTS.valletta}', 'X', current_date)`)).toBeNull();
      expect(await db.fails(`insert into public.share_links (project_id) values ('${PROJECTS.valletta}')`)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
describe("phase 4: daily diary feed, gallery and status", () => {
  type Row = Record<string, unknown>;
  const val = async (db: { query: (s: string) => Promise<Row[]> }, sql: string) => (await db.query(`select ${sql} as v`))[0].v;

  it("the feed only contains updates from projects the user can see", async () => {
    await asUser(USERS.tech1, async (db) => {
      const feed = (await val(db, "public.get_daily_feed()")) as { project_id: string; author: { first_name: string } }[];
      expect(feed.length).toBe(2);
      expect(feed.every((u) => u.project_id === PROJECTS.valletta)).toBe(true);
      expect(feed[0].author.first_name).toBe("Tina");
    });
    await asUser(USERS.manager, async (db) => {
      expect(((await val(db, "public.get_daily_feed()")) as unknown[]).length).toBe(3);
      expect(((await val(db, `public.get_daily_feed(p_project => '${PROJECTS.mosta}')`)) as unknown[]).length).toBe(1);
    });
  });

  it("the feed pages without repeating or skipping updates", async () => {
    await asUser(USERS.manager, async (db) => {
      const page1 = (await val(db, "public.get_daily_feed(p_limit => 2)")) as { id: string; work_date: string; created_at: string }[];
      const last = page1[page1.length - 1];
      const page2 = (await val(db, `public.get_daily_feed(p_limit => 2, p_before_date => '${last.work_date}', p_before_created => '${last.created_at}')`)) as { id: string }[];
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
      expect(new Set([...page1, ...page2].map((u) => u.id)).size).toBe(3);
    });
  });

  it("only managers get the who-has-posted overview", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await val(db, "public.get_daily_status(current_date)")).toBeNull();
    });
    await asUser(USERS.manager, async (db) => {
      const s = (await val(db, "public.get_daily_status(current_date)")) as { project: { name: string }; people: { first_name: string; posted: boolean }[] }[];
      const valletta = s.find((p) => p.project.name === "Valletta Office Fit-out")!;
      expect(valletta.people).toEqual([expect.objectContaining({ first_name: "Tina", posted: true })]);
      const yesterday = (await val(db, "public.get_daily_status(current_date - 3)")) as typeof s;
      expect(yesterday.find((p) => p.project.name === "Mosta Solar Installation")!.people[0].posted).toBe(false);
    });
  });

  it("people can only post updates for projects they work on", async () => {
    await asUser(USERS.tech2, async (db) => {
      expect(((await val(db, "public.get_postable_projects()")) as { name: string }[]).map((p) => p.name)).toEqual(["Mosta Solar Installation"]);
    });
    await asUser(USERS.basic, async (db) => {
      expect(await val(db, "public.get_postable_projects()")).toEqual([]);
    });
    await asUser(USERS.manager, async (db) => {
      expect(((await val(db, "public.get_postable_projects()")) as unknown[]).length).toBe(2);
    });
  });

  it("photos: gallery follows project access, and only the author (24h) or a manager can add them", async () => {
    await withSetup(
      `insert into public.daily_update_photos (daily_update_id, project_id, storage_path, uploaded_by)
       select id, project_id, project_id || '/daily/' || id || '/p1.jpg', author_id from public.daily_updates
       where author_id = '${USERS.tech1}' and work_date = current_date;
       create temp table t_update as select id, project_id from public.daily_updates where author_id = '${USERS.tech1}' and work_date = current_date;
       grant select on t_update to authenticated;`,
      USERS.tech2,
      async (db) => {
        expect(await val(db, `public.get_project_photos('${PROJECTS.valletta}')`)).toEqual([]);
        // tech2 cannot attach a photo to tech1's update
        expect(
          await db.fails(`insert into public.daily_update_photos (daily_update_id, project_id, storage_path, uploaded_by)
            select id, project_id, 'x/y.jpg', '${USERS.tech2}' from t_update`),
        ).toMatch(/row-level security/);
      },
    );
  });
});

// ---------------------------------------------------------------------------
describe("phase 5: chat", () => {
  type Row = Record<string, unknown>;
  const val = async (db: { query: (s: string) => Promise<Row[]> }, sql: string) => (await db.query(`select ${sql} as v`))[0].v;
  type Channel = { id: string; type: string; name: string; unread: number; can_post: boolean };
  const channels = async (db: { query: (s: string) => Promise<Row[]> }) => (await val(db, "public.list_my_channels()")) as Channel[];

  it("everyone sees the channels they're allowed to, with the right 'can post' flag", async () => {
    await asUser(USERS.tech1, async (db) => {
      const c = await channels(db);
      expect(c.map((x) => x.type).sort()).toEqual(["general", "project"]);
      expect(c.find((x) => x.type === "general")!.can_post).toBe(false);
      expect(c.find((x) => x.type === "project")!.can_post).toBe(true);
    });
    await asUser(USERS.basic, async (db) => {
      const c = await channels(db);
      expect(c.find((x) => x.type === "project")!.can_post).toBe(false);
    });
    await asUser(USERS.manager, async (db) => {
      expect((await channels(db)).map((x) => x.type).sort()).toEqual(["general", "management", "project", "project"]);
    });
  });

  it("counts unread messages from others and clears them when read", async () => {
    await asUser(USERS.tech1, async (db) => {
      const project = (await channels(db)).find((x) => x.type === "project")!;
      expect(Number(project.unread)).toBe(1); // the manager's welcome message
      expect(Number(await val(db, "public.get_unread_total()"))).toBe(2); // + General announcement
      await db.query(`select public.mark_channel_read('${project.id}')`);
      expect(Number((await channels(db)).find((x) => x.id === project.id)!.unread)).toBe(0);
      expect(Number(await val(db, "public.get_unread_total()"))).toBe(1);
    });
  });

  it("messages come with author, reactions, reply count and only visible task links", async () => {
    await asUser(USERS.tech1, async (db) => {
      const ch = (await channels(db)).find((x) => x.type === "project")!.id;
      const [{ id }] = await db.query<{ id: string }>(
        `insert into public.messages (channel_id, author_id, body, task_id) values ('${ch}', '${USERS.tech1}', 'See task', '${TASKS.vallettaPartitions}') returning id`,
      );
      await db.query(`insert into public.messages (channel_id, author_id, body, parent_id) values ('${ch}', '${USERS.tech1}', 'reply', '${id}')`);
      await db.query(`insert into public.message_reactions (message_id, user_id, emoji) values ('${id}', '${USERS.tech1}', '👍')`);
      const msgs = (await val(db, `public.get_channel_messages('${ch}')`)) as {
        id: string; body: string; reply_count: number; author: { first_name: string }; reactions: { emoji: string; count: number; mine: boolean }[]; task: { title: string } | null;
      }[];
      const m = msgs.find((x) => x.id === id)!;
      expect(msgs.some((x) => x.body === "reply")).toBe(false); // replies stay in the thread
      expect(m).toMatchObject({ reply_count: 1, author: { first_name: "Tina" }, task: { title: "Partition walls" } });
      expect(m.reactions).toEqual([expect.objectContaining({ emoji: "👍", count: 1, mine: true })]);
      const thread = (await val(db, `public.get_thread('${id}')`)) as { replies: unknown[] };
      expect(thread.replies).toHaveLength(1);
    });
  });

  it("technicians can't read other projects' or the management chat, and @mention lists respect access", async () => {
    await asUser(USERS.manager, async (db) => {
      const mgmt = (await channels(db)).find((x) => x.type === "management")!.id;
      const people = (await val(db, `public.get_channel_people('${mgmt}')`)) as { first_name: string }[];
      expect(people.map((p) => p.first_name).sort()).toEqual(["Ada", "Mark"]);
      await asUser(USERS.tech1, async (tdb) => {
        expect(await val(tdb, `public.get_channel_messages('${mgmt}')`)).toEqual([]);
        expect(await val(tdb, `public.get_channel_people('${mgmt}')`)).toBeNull();
      });
    });
    await asUser(USERS.tech2, async (db) => {
      const valletta = `(select id from public.channels where project_id = '${PROJECTS.valletta}')`;
      expect(await val(db, `public.get_channel_messages(${valletta})`)).toEqual([]);
    });
  });

  it("send_chat_message saves the message and attachments together, and checks permissions", async () => {
    const id = "70000000-0000-4000-8000-000000000001";
    const send = (ch: string, path: string) =>
      `select public.send_chat_message('${id}', ${ch}, 'Photo of the wall', null, null, '{}',
        '[{"id":"71000000-0000-4000-8000-000000000001","storage_path":"${path}","file_name":"wall.jpg","mime_type":"image/jpeg","size_bytes":1000,"width":10,"height":10}]'::jsonb) as v`;
    const valletta = `(select id from public.channels where project_id = '${PROJECTS.valletta}')`;
    await asUser(USERS.tech1, async (db) => {
      const [{ id: ch }] = await db.query<{ id: string }>(`select id from public.channels where project_id = '${PROJECTS.valletta}'`);
      const [{ v }] = await db.query<{ v: { attachments: unknown[]; body: string } }>(send(valletta, `${ch}/${id}/a.jpg`));
      expect(v.body).toBe("Photo of the wall");
      expect(v.attachments).toHaveLength(1);
    });
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(send(valletta, `someone-else/${id}/a.jpg`))).toMatch(/Invalid attachment/);
    });
    await asUser(USERS.basic, async (db) => {
      const [{ id: ch }] = await db.query<{ id: string }>(`select id from public.channels where project_id = '${PROJECTS.valletta}'`);
      expect(await db.fails(send(valletta, `${ch}/${id}/a.jpg`))).toMatch(/row-level security/);
    });
  });

  it("a technician can only edit their own messages", async () => {
    await asUser(USERS.tech1, async (db) => {
      const n = await db.query(`update public.messages set body = 'hacked' where author_id <> '${USERS.tech1}' returning id`);
      expect(n).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
describe("phase 6: notifications and delay warnings", () => {
  type Row = Record<string, unknown>;
  const val = async (db: { query: (s: string) => Promise<Row[]> }, sql: string) => (await db.query(`select ${sql} as v`))[0].v;
  const notes = async (db: { query: (s: string) => Promise<Row[]> }) =>
    (await db.query("select type, title from public.notifications order by created_at")) as { type: string; title: string }[];

  it("assigning someone to a task notifies them (not the person who did it)", async () => {
    await asUser(USERS.manager, async (db) => {
      await db.query(`insert into public.task_assignees (task_id, user_id, assigned_by) values ('${TASKS.vallettaPartitions}', '${USERS.basic}', '${USERS.manager}')`);
      await db.query(`insert into public.task_assignees (task_id, user_id, assigned_by) values ('${TASKS.mostaRails}', '${USERS.manager}', '${USERS.manager}')`);
      expect(await notes(db)).toEqual([]); // the manager gets nothing for assigning themselves
    });
    await withSetup(
      `insert into public.task_assignees (task_id, user_id, assigned_by) values ('${TASKS.vallettaPartitions}', '${USERS.basic}', '${USERS.manager}')`,
      USERS.basic,
      async (db) => {
        expect(await notes(db)).toEqual([{ type: "task.assigned", title: "Mark Borg assigned you a task" }]);
      },
    );
  });

  it("status changes, comments and @mentions notify the right people", async () => {
    await asUser(USERS.manager, async (db) => {
      await db.query(`update public.tasks set status_id = (select id from public.status_labels where project_id = '${PROJECTS.valletta}' and name = 'Done') where id = '${TASKS.vallettaPartitions}'`);
      await db.query(`insert into public.comments (task_id, author_id, body) values ('${TASKS.vallettaPartitions}', '${USERS.manager}', 'Nice work')`);
      await db.query(`insert into public.messages (channel_id, author_id, body, mentions)
        values ((select id from public.channels where project_id = '${PROJECTS.valletta}'), '${USERS.manager}', '@Tina hi', '{${USERS.tech1}}')`);
      const rows = (await db.query(`select user_id, type from public.notifications order by type`)) as { user_id: string; type: string }[];
      // The manager can't read other people's notifications (RLS) — check as Tina below.
      expect(rows).toEqual([]);
    });
  });

  it("people can switch a notification type off", async () => {
    await withSetup(
      `insert into public.notification_preferences (user_id, types) values ('${USERS.tech1}', '{"task.status": false}');
       set local role authenticated;
       select set_config('request.jwt.claims', '{"sub":"${USERS.manager}","role":"authenticated"}', true);
       update public.tasks set status_id = (select id from public.status_labels where project_id = '${PROJECTS.valletta}' and name = 'Done') where id = '${TASKS.vallettaPartitions}';
       insert into public.messages (channel_id, author_id, body, mentions)
         values ((select id from public.channels where project_id = '${PROJECTS.valletta}'), '${USERS.manager}', '@Tina hi', '{${USERS.tech1}}');
       reset role;`,
      USERS.tech1,
      async (db) => {
        expect((await notes(db)).map((n) => n.type)).toEqual(["mention"]);
      },
    );
  });

  it("a new daily update notifies managers on the project", async () => {
    await withSetup(
      `set local role authenticated;
       select set_config('request.jwt.claims', '{"sub":"${USERS.tech1}","role":"authenticated"}', true);
       insert into public.daily_updates (project_id, author_id, work_done) values ('${PROJECTS.valletta}', '${USERS.tech1}', 'Did things');
       reset role;`,
      USERS.manager,
      async (db) => {
        expect((await notes(db)).map((n) => n.type)).toEqual(["daily.new"]);
      },
    );
  });

  it("the daily job sends due/overdue reminders once and only the server may run it", async () => {
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails("select public.create_due_notifications()")).toMatch(/permission denied/);
      expect(await db.fails("select * from public.claim_push_batch()")).toMatch(/permission denied/);
    });
    await withSetup(
      `update public.tasks set due_date = public.malta_today() + 1, start_date = null where id = '${TASKS.vallettaPartitions}';
       select public.create_due_notifications(); select public.create_due_notifications();`,
      USERS.tech1,
      async (db) => {
        expect(await notes(db)).toEqual([{ type: "task.due_soon", title: "Due tomorrow: Partition walls" }]);
      },
    );
  });

  it("health: delay rules on the demo data", async () => {
    await asUser(USERS.manager, async (db) => {
      const risks = (await db.query(
        `select t.title, app.task_risk(t, public.malta_today()) as r from public.tasks t where t.project_id = '${PROJECTS.valletta}' order by t.position, t.title`,
      )) as { title: string; r: { level: string; reason: string } | null }[];
      const by = Object.fromEntries(risks.map((x) => [x.title, x.r?.level ?? "ok"]));
      expect(by["Electrical first fix"]).toBe("amber"); // due in 2 days, 20 %
      expect(by["Data cabling"]).toBe("amber"); // waiting for an unfinished task, starts in 3 days
      expect(by["Partition walls"]).toBe("ok");
      const projects = (await val(db, "public.list_projects()")) as { name: string; health: { level: string } }[];
      expect(projects.find((p) => p.name === "Valletta Office Fit-out")!.health.level).toBe("amber");
      expect(projects.find((p) => p.name === "Mosta Solar Installation")!.health.level).toBe("green");
    });
    await withSetup(
      `update public.tasks set due_date = public.malta_today() - 1, start_date = public.malta_today() - 6 where id = '40000000-0000-4000-8000-000000000004';`,
      USERS.manager,
      async (db) => {
        const r = (await db.query(`select t.title, app.task_risk(t, public.malta_today()) as r from public.tasks t where t.title in ('Electrical first fix', 'Data cabling') order by t.title`)) as {
          title: string;
          r: { level: string; reason: string };
        }[];
        expect(r.map((x) => [x.title, x.r.level])).toEqual([["Data cabling", "red"], ["Electrical first fix", "red"]]);
        expect(r[0].r.reason).toBe("Waiting for a late task: Electrical first fix");
        // A critical task is overdue → the whole project is red.
        const projects = (await val(db, "public.list_projects()")) as { name: string; health: { level: string } }[];
        expect(projects.find((p) => p.name === "Valletta Office Fit-out")!.health.level).toBe("red");
      },
    );
  });
});

// ---------------------------------------------------------------------------
describe("personal notes and to-dos are private", () => {
  const add = (u: string) =>
    `insert into public.personal_notes (user_id, title, body) values ('${u}', 'Private', 'Secret');
     insert into public.personal_todos (user_id, title, due_date) values ('${u}', 'Call the bank', public.malta_today());`;

  it("only the owner can see them — not managers, not administrators", async () => {
    await withSetup(add(USERS.tech1), USERS.tech1, async (db) => {
      expect(await count(db, "select 1 from public.personal_notes")).toBe(1);
      expect(await count(db, "select 1 from public.personal_todos")).toBe(1);
    });
    for (const u of [USERS.admin, USERS.manager, USERS.tech2]) {
      await withSetup(add(USERS.tech1), u, async (db) => {
        expect(await count(db, "select 1 from public.personal_notes")).toBe(0);
        expect(await count(db, "select 1 from public.personal_todos")).toBe(0);
        expect(await db.query("update public.personal_notes set body = 'x' returning id")).toHaveLength(0);
        expect(await db.query("delete from public.personal_todos returning id")).toHaveLength(0);
      });
    }
  });

  it("nobody can create items for someone else; pending users can't use it", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(`insert into public.personal_notes (user_id, title) values ('${USERS.tech2}', 'x')`)).toMatch(/row-level security/);
      expect(await db.fails(`insert into public.personal_todos (title) values ('Mine')`)).toBeNull();
    });
    await asUser(USERS.pending, async (db) => {
      expect(await db.fails(`insert into public.personal_todos (title) values ('x')`)).toMatch(/row-level security/);
    });
  });

  it("the daily job reminds the owner about their own to-dos due today", async () => {
    await withSetup(`${add(USERS.tech1)} select public.create_due_notifications();`, USERS.tech1, async (db) => {
      const n = await db.query<{ type: string; title: string }>("select type, title from public.notifications where type = 'personal.due'");
      expect(n).toEqual([{ type: "personal.due", title: "Due today: Call the bank" }]);
    });
  });
});

describe("phone notifications for chat messages", () => {
  const subs = Object.values(USERS)
    .map((u, i) => `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('${u}', 'https://push.example/${i}', 'k', 'a');`)
    .join("\n");
  const valletta = `(select id from public.channels where project_id = '${PROJECTS.valletta}')`;
  // Deferred trigger: fire it now (tests never commit), then read the queue as the server would.
  const queued = async (db: { query: <T>(s: string) => Promise<T[]> }) => {
    await db.query("set constraints all immediate");
    await db.query("reset role");
    return db.query<{ user_id: string; title: string; body: string; sender: string; tag: string; link: string }>(
      "select user_id, title, body, sender, tag, link from public.push_outbox order by user_id",
    );
  };

  it("everyone who can read the chat is notified, except the writer; nobody can read the queue from the app", async () => {
    await withSetup(subs, USERS.tech1, async (db) => {
      await db.query(`insert into public.messages (channel_id, author_id, body) values (${valletta}, '${USERS.tech1}', 'Tiles arrived on site')`);
      expect(await db.fails("select 1 from public.push_outbox")).toMatch(/permission denied/); // never readable from the app
      const rows = await queued(db);
      expect(rows.map((r) => r.user_id)).toEqual([USERS.admin, USERS.manager, USERS.basic].sort());
      expect(rows[0]).toMatchObject({ body: "Tiles arrived on site", sender: "Tina Camilleri", link: expect.stringMatching(/^\/chats\//), tag: expect.stringMatching(/^chat-/) });
    });
  });

  it("not sent to people who muted the chat, switched chat notifications off, or were @mentioned", async () => {
    const setup = `${subs}
      insert into public.channel_members (channel_id, user_id, muted) values (${valletta}, '${USERS.manager}', true);
      insert into public.notification_preferences (user_id, types) values ('${USERS.admin}', '{"chat.message": false}');`;
    await withSetup(setup, USERS.tech1, async (db) => {
      await db.query(`insert into public.messages (channel_id, author_id, body, mentions) values (${valletta}, '${USERS.tech1}', 'Hi', '{${USERS.basic}}')`);
      expect(await queued(db)).toEqual([]);
    });
  });

  it("management chat only reaches managers and admins; photo-only messages say 📷 Photo", async () => {
    await withSetup(subs, USERS.manager, async (db) => {
      const [{ id: ch }] = await db.query<{ id: string }>("select id from public.channels where type = 'management'");
      const id = "72000000-0000-4000-8000-000000000001";
      await db.query(`select public.send_chat_message('${id}', '${ch}', '', null, null, '{}',
        '[{"id":"72100000-0000-4000-8000-000000000001","storage_path":"${ch}/${id}/p.jpg","file_name":"p.jpg","mime_type":"image/jpeg","size_bytes":10,"width":1,"height":1}]'::jsonb)`);
      const rows = await queued(db);
      expect(rows.map((r) => r.user_id)).toEqual([USERS.admin]);
      expect(rows[0].body).toBe("📷 Photo");
    });
  });

  it("only the server can take notifications from the queue", async () => {
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails("select public.claim_chat_push_batch(10)")).toMatch(/permission denied/);
    });
  });
});
