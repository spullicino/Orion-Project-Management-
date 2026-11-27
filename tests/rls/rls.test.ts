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
            "select tablename from pg_tables where schemaname = 'public' and tablename not in ('rate_limits', 'push_outbox', 'job_secrets', 'user_activity', 'audit_log', 'deleted_tasks', 'as_mail_settings') order by 1",
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
describe("names set by an administrator", () => {
  it("an admin can fill in another person's first name and surname", async () => {
    await asUser(USERS.admin, async (db) => {
      const rows = await db.query(`update public.profiles set first_name = 'Sunny', last_name = 'Lakha' where id = '${USERS.tech2}' returning first_name, last_name`);
      expect(rows).toEqual([{ first_name: "Sunny", last_name: "Lakha" }]);
    });
  });

  it("a manager cannot change someone else's name (row is invisible to update)", async () => {
    await asUser(USERS.manager, async (db) => {
      expect(await db.query(`update public.profiles set first_name = 'X' where id = '${USERS.tech1}' returning id`)).toHaveLength(0);
    });
  });

  it("a technician cannot change someone else's name", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.query(`update public.profiles set first_name = 'X' where id = '${USERS.tech2}' returning id`)).toHaveLength(0);
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

  it("the daily email summary goes to everyone unless they switched it off", async () => {
    const setup = `
      insert into public.notification_preferences (user_id, email_digest) values ('${USERS.tech2}', false)
        on conflict (user_id) do update set email_digest = false;
      delete from public.notification_preferences where user_id = '${USERS.tech1}';
      create temp table digest_out as select jsonb_array_elements(public.get_digest_recipients()) ->> 'user_id' as id;
      grant select on digest_out to authenticated;`;
    await withSetup(setup, USERS.tech1, async (db) => {
      const ids = (await db.query<{ id: string }>("select id from digest_out")).map((r) => r.id);
      expect(ids).toContain(USERS.tech1);
      expect(ids).not.toContain(USERS.tech2);
    });
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails("select public.get_digest_recipients()")).toMatch(/permission denied/);
    });
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

describe("repeating tasks", () => {
  const task = "40000000-0000-4000-8000-000000000004"; // Electrical first fix: tech1 owner, 3 checklist items, start -5, due +2
  const done = `(select id from public.status_labels where project_id = '${PROJECTS.valletta}' and is_done limit 1)`;
  const notDone = `(select id from public.status_labels where project_id = '${PROJECTS.valletta}' and not is_done order by position limit 1)`;
  type Next = { id: string; start_date: string; due_date: string; done: boolean; title: string; days: number; owners: number; checks: number; ticked: number };
  const nextOf = async (db: { query: <T>(s: string) => Promise<T[]> }) =>
    db.query<Next>(`select n.id, n.title, (n.completed_at is not null) as done, (n.due_date - o.due_date) as days, (n.due_date - n.start_date) as span_days,
        (select count(*)::int from public.task_assignees a where a.task_id = n.id) as owners,
        (select count(*)::int from public.task_checklist_items c where c.task_id = n.id) as checks,
        (select count(*)::int from public.task_checklist_items c where c.task_id = n.id and c.is_done) as ticked
      from public.tasks n join public.tasks o on o.id = n.repeated_from where n.repeated_from = '${task}'`);

  it("finishing a weekly task creates next week's, with owners and an unticked checklist", async () => {
    await asUser(USERS.tech1, async (db) => {
      await db.query(`update public.tasks set repeat_rule = 'weekly' where id = '${task}'`);
      await db.query(`update public.tasks set status_id = ${done} where id = '${task}'`);
      const next = await nextOf(db);
      expect(next).toHaveLength(1);
      expect(next[0]).toMatchObject({ title: "Electrical first fix", done: false, days: 7, span_days: 7, owners: 1, checks: 3, ticked: 0 });
      const n = await db.query<{ title: string }>(`select title from public.notifications where user_id = '${USERS.tech1}' and task_id = '${next[0].id}'`);
      expect(n[0].title).toBe("🔁 Repeating task: Electrical first fix");

      // Un-done and done again: still only one next task.
      await db.query(`update public.tasks set status_id = ${notDone} where id = '${task}'`);
      await db.query(`update public.tasks set status_id = ${done} where id = '${task}'`);
      expect(await nextOf(db)).toHaveLength(1);
    });
  });

  it("stops after the 'until' date, and skips ahead when finished late", async () => {
    await asUser(USERS.tech1, async (db) => {
      await db.query(`update public.tasks set repeat_rule = 'monthly', repeat_until = due_date + 5 where id = '${task}'`);
      await db.query(`update public.tasks set status_id = ${done} where id = '${task}'`);
      expect(await nextOf(db)).toHaveLength(0);
    });
    await asUser(USERS.tech1, async (db) => {
      await db.query(`update public.tasks set repeat_rule = 'daily', start_date = null, due_date = public.malta_today() - 10 where id = '${task}'`);
      await db.query(`update public.tasks set status_id = ${done} where id = '${task}'`);
      const [n] = await db.query<{ due: string; today: string }>(
        `select due_date::text as due, public.malta_today()::text as today from public.tasks where repeated_from = '${task}'`,
      );
      expect(n.due).toBe(n.today);
    });
  });

  it("next dates: weekdays skip the weekend, months keep the end of the month", async () => {
    await asUser(USERS.tech1, async (db) => {
      const [r] = await db.query<Record<string, string>>(`select
        app.next_repeat_date('2026-11-27', 'weekdays')::text as fri, app.next_repeat_date('2026-11-28', 'weekdays')::text as sat,
        app.next_repeat_date('2026-01-31', 'monthly')::text as jan31, app.next_repeat_date('2026-11-20', 'fortnightly')::text as fort,
        app.next_repeat_date('2026-11-20', 'quarterly')::text as q, app.next_repeat_date('2028-02-29', 'yearly')::text as leap`);
      expect(r).toEqual({ fri: "2026-11-30", sat: "2026-11-30", jan31: "2026-02-28", fort: "2026-12-04", q: "2027-02-20", leap: "2029-02-28" });
    });
  });

  it("only known repeat options are accepted, and other projects' tasks can't be changed", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(`update public.tasks set repeat_rule = 'hourly' where id = '${task}'`)).toMatch(/check constraint/);
    });
    await asUser(USERS.tech2, async (db) => {
      expect(await db.query(`update public.tasks set repeat_rule = 'daily' where id = '${task}' returning id`)).toHaveLength(0);
    });
  });
});

describe("repeating tasks in copied projects", () => {
  it("a copy keeps the repeat setting and only the latest task of each series", async () => {
    const task = "40000000-0000-4000-8000-000000000004";
    await asUser(USERS.manager, async (db) => {
      await db.query(`update public.tasks set repeat_rule = 'weekly' where id = '${task}'`);
      await db.query(`update public.tasks set status_id = (select id from public.status_labels where project_id = '${PROJECTS.valletta}' and is_done limit 1) where id = '${task}'`);
      const [{ v: copy }] = await db.query<{ v: string }>(`select public.duplicate_project('${PROJECTS.valletta}', 'Copy') as v`);
      const rows = await db.query<{ repeat_rule: string }>(`select repeat_rule from public.tasks where project_id = '${copy}' and title = 'Electrical first fix'`);
      expect(rows).toEqual([{ repeat_rule: "weekly" }]);
    });
  });
});

describe("internal tasks", () => {
  const invoice = `insert into public.tasks (id, project_id, group_id, title, is_internal, due_date)
    values ('41000000-0000-4000-8000-000000000001', '${PROJECTS.valletta}', '${GROUPS.vallettaInProgress}', 'Issue monthly invoice', true, public.malta_today() - 3);
    insert into public.task_dependencies (task_id, depends_on_task_id) values ('${TASKS.vallettaPartitions}', '41000000-0000-4000-8000-000000000001');
    insert into public.share_links (project_id, token) values ('${PROJECTS.valletta}', repeat('b', 48));`;

  it("never appear on the client's share link (nor as a 'waiting for' arrow)", async () => {
    await withSetup(invoice, USERS.tech1, async (db) => {
      await db.query("reset role");
      await db.query("set local role anon");
      const [{ s }] = await db.query<{ s: { tasks: { title: string; id: string; blocked_by: string[] }[] } }>(`select public.get_shared_project(repeat('b', 48)) as s`);
      expect(s.tasks.map((t) => t.title)).not.toContain("Issue monthly invoice");
      expect(s.tasks.find((t) => t.id === TASKS.vallettaPartitions)!.blocked_by).toEqual([]);
    });
  });

  it("the team still sees them, but they don't count towards progress or health", async () => {
    await withSetup(invoice, USERS.manager, async (db) => {
      expect(await count(db, "select 1 from public.tasks where title = 'Issue monthly invoice'")).toBe(1);
      const [{ before }] = await db.query<{ before: { task_count: number; overdue_count: number; health: unknown } }>(
        `select x as before from jsonb_array_elements(public.list_projects()) x where x->>'id' = '${PROJECTS.valletta}'`,
      );
      await db.query("update public.tasks set is_internal = false where title = 'Issue monthly invoice'");
      const [{ after }] = await db.query<{ after: { task_count: number; overdue_count: number; health: unknown } }>(
        `select x as after from jsonb_array_elements(public.list_projects()) x where x->>'id' = '${PROJECTS.valletta}'`,
      );
      expect(Number(after.task_count)).toBe(Number(before.task_count) + 1);
      expect(Number(after.overdue_count)).toBe(Number(before.overdue_count) + 1);
      expect(after.health).not.toEqual(before.health);
    });
  });

  it("basic users can see them but not change them", async () => {
    await withSetup(invoice, USERS.basic, async (db) => {
      expect(await count(db, "select 1 from public.tasks where is_internal")).toBe(1);
      expect(await db.query("update public.tasks set is_internal = false where is_internal returning id")).toHaveLength(0);
    });
  });
});

describe("people only see projects they're on (managers included; admins see all)", () => {
  const other = "20000000-0000-4000-8000-0000000000aa";
  // A project the manager is NOT on (created by the admin), with a task, a chat message and a daily update.
  const setup = `
    insert into public.projects (id, name, created_by) values ('${other}', 'Sliema Tower', '${USERS.admin}');
    insert into public.groups (id, project_id, name) values ('30000000-0000-4000-8000-0000000000aa', '${other}', 'Main');
    insert into public.tasks (project_id, group_id, title) values ('${other}', '30000000-0000-4000-8000-0000000000aa', 'Secret task');
    insert into public.messages (channel_id, author_id, body) values ((select id from public.channels where project_id = '${other}'), '${USERS.admin}', 'Hello Sliema');
    insert into public.share_links (project_id, token) values ('${other}', repeat('c', 48));`;

  it("a manager who isn't on a project can't see it or anything in it", async () => {
    await withSetup(setup, USERS.manager, async (db) => {
      expect(await count(db, `select 1 from public.projects where id = '${other}'`)).toBe(0);
      expect(await count(db, `select 1 from public.tasks where project_id = '${other}'`)).toBe(0);
      expect(await count(db, `select 1 from public.groups where project_id = '${other}'`)).toBe(0);
      expect(await count(db, `select 1 from public.status_labels where project_id = '${other}'`)).toBe(0);
      expect(await count(db, `select 1 from public.share_links where project_id = '${other}'`)).toBe(0);
      expect(await count(db, `select 1 from public.channels where project_id = '${other}'`)).toBe(0);
      expect(await count(db, "select 1 from public.messages where body = 'Hello Sliema'")).toBe(0);
      const list = (await db.query<{ v: { id: string }[] }>("select public.list_projects() as v"))[0].v;
      expect(list.map((p) => p.id)).not.toContain(other);
      const status = (await db.query<{ v: { project: { id: string } }[] }>("select public.get_daily_status(public.malta_today()) as v"))[0].v;
      expect(status.map((s) => s.project.id)).not.toContain(other);
    });
  });

  it("…and can't change it, add people, or delete from it", async () => {
    await withSetup(setup, USERS.manager, async (db) => {
      expect(await db.query(`update public.projects set name = 'x' where id = '${other}' returning id`)).toHaveLength(0);
      expect(await db.fails(`insert into public.project_members (project_id, user_id) values ('${other}', '${USERS.manager}')`)).toMatch(/row-level security/);
      expect(await db.query(`delete from public.tasks where project_id = '${other}' returning id`)).toHaveLength(0);
      expect(await db.fails(`insert into public.groups (project_id, name) values ('${other}', 'Sneaky')`)).toMatch(/row-level security/);
    });
  });

  it("once added to the project, the manager sees and manages it", async () => {
    await withSetup(`${setup} insert into public.project_members (project_id, user_id) values ('${other}', '${USERS.manager}');`, USERS.manager, async (db) => {
      expect(await count(db, `select 1 from public.tasks where project_id = '${other}'`)).toBe(1);
      expect(await db.query(`update public.projects set name = 'Sliema Tower B' where id = '${other}' returning id`)).toHaveLength(1);
    });
  });

  it("administrators see every project", async () => {
    await withSetup(setup.replace(`'${USERS.admin}');\n`, `'${USERS.manager}');\n`).replace("created_by) values ('" + other + "', 'Sliema Tower', '" + USERS.admin + "')", "created_by) values ('" + other + "', 'Sliema Tower', '" + USERS.manager + "')"), USERS.admin, async (db) => {
      expect(await count(db, `select 1 from public.projects where id = '${other}'`)).toBe(1);
    });
  });

  it("whoever creates a project is added to it automatically (and copies too)", async () => {
    await asUser(USERS.manager, async (db) => {
      const [{ id }] = await db.query<{ id: string }>("insert into public.projects (name) values ('New job') returning id");
      expect(await count(db, `select 1 from public.project_members where project_id = '${id}' and user_id = '${USERS.manager}'`)).toBe(1);
      const [{ v: copy }] = await db.query<{ v: string }>(`select public.duplicate_project('${PROJECTS.valletta}', 'Copy') as v`);
      expect(await count(db, `select 1 from public.project_members where project_id = '${copy}' and user_id = '${USERS.manager}'`)).toBe(1);
      expect(await count(db, `select 1 from public.tasks where project_id = '${copy}'`)).toBeGreaterThan(0);
    });
  });

  it("@mention lists and chat notifications leave out managers who aren't on the project", async () => {
    await withSetup(setup, USERS.admin, async (db) => {
      const people = (await db.query<{ v: { first_name: string }[] }>(
        `select public.get_channel_people((select id from public.channels where project_id = '${other}')) as v`,
      ))[0].v;
      expect(people.map((p) => p.first_name)).toEqual(["Ada"]);
    });
  });
});

describe("copy a task to other projects", () => {
  const task = "40000000-0000-4000-8000-000000000004"; // Valletta "Electrical first fix": tech1 owner, 3 checklist items
  const copy = (targets: string) => `select public.copy_task_to_projects('${task}', '${targets}'::jsonb) as v`;
  type Copied = { title: string; due: string; days: number; done: boolean; checks: number; ticked: number; owners: string[]; internal: boolean; rule: string | null };
  const copiedInto = async (db: { query: <T>(s: string) => Promise<T[]> }, project: string) =>
    db.query<Copied>(`select n.title, n.due_date::text as due, (n.due_date - o.due_date) as days, (n.completed_at is not null) as done,
        n.is_internal as internal, n.repeat_rule as rule,
        (select count(*)::int from public.task_checklist_items c where c.task_id = n.id) as checks,
        (select count(*)::int from public.task_checklist_items c where c.task_id = n.id and c.is_done) as ticked,
        coalesce((select array_agg(a.user_id::text order by a.user_id) from public.task_assignees a where a.task_id = n.id), '{}') as owners
      from public.tasks n, public.tasks o where o.id = '${task}' and n.project_id = '${project}' and n.title = 'Electrical first fix'`);

  it("a manager copies it to another project with a new date; owners not on that project are left off", async () => {
    await asUser(USERS.manager, async (db) => {
      await db.query(`update public.tasks set is_internal = true, repeat_rule = 'monthly' where id = '${task}'`);
      await db.query(`insert into public.task_assignees (task_id, user_id) values ('${task}', '${USERS.manager}')`);
      const [{ v }] = await db.query<{ v: { project_id: string; task_id: string }[] }>(
        copy(`[{"project_id":"${PROJECTS.mosta}","due_date":"2027-01-20"}]`),
      );
      expect(v).toHaveLength(1);
      const [c] = await copiedInto(db, PROJECTS.mosta);
      // Mosta members: manager + tech2 — so tech1 (not on Mosta) is dropped.
      expect(c).toMatchObject({ due: "2027-01-20", done: false, checks: 3, ticked: 0, internal: true, rule: "monthly", owners: [USERS.manager] });
    });
  });

  it("a technician can't copy into a project they're not on", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(copy(`[{"project_id":"${PROJECTS.mosta}"}]`))).toMatch(/can't add tasks/);
    });
  });

  it("nobody can copy a task from a project they can't see", async () => {
    await asUser(USERS.tech2, async (db) => {
      expect(await db.fails(copy(`[{"project_id":"${PROJECTS.mosta}"}]`))).toMatch(/Task not found/);
    });
  });

  it("basic users can't copy at all", async () => {
    await asUser(USERS.basic, async (db) => {
      expect(await db.fails(copy(`[{"project_id":"${PROJECTS.valletta}"}]`))).toMatch(/can't add tasks/);
    });
  });
});

describe("photos & files of a chat", () => {
  const valletta = `(select id from public.channels where project_id = '${PROJECTS.valletta}')`;
  const setup = `
    insert into public.messages (id, channel_id, author_id, body) values ('73000000-0000-4000-8000-000000000001', ${valletta}, '${USERS.tech1}', 'Photos');
    insert into public.message_attachments (message_id, storage_path, file_name, mime_type, size_bytes, width, height) values
      ('73000000-0000-4000-8000-000000000001', 'x/73000000-0000-4000-8000-000000000001/a.jpg', 'a.jpg', 'image/jpeg', 100, 10, 10),
      ('73000000-0000-4000-8000-000000000001', 'x/73000000-0000-4000-8000-000000000001/plan.pdf', 'plan.pdf', 'application/pdf', 900, null, null);
    insert into public.messages (id, channel_id, author_id, body, deleted_at) values ('73000000-0000-4000-8000-000000000002', ${valletta}, '${USERS.tech1}', '', now());
    insert into public.message_attachments (message_id, storage_path, file_name, mime_type, size_bytes, width, height) values
      ('73000000-0000-4000-8000-000000000002', 'x/73000000-0000-4000-8000-000000000002/gone.jpg', 'gone.jpg', 'image/jpeg', 100, 10, 10);`;
  const media = (kind: string) => `select public.get_channel_media(${valletta}, '${kind}') as v`;

  it("lists photos and files separately, without deleted messages", async () => {
    await withSetup(setup, USERS.basic, async (db) => {
      const [{ v: photos }] = await db.query<{ v: { file_name: string; author: { first_name: string } }[] }>(media("photos"));
      const [{ v: files }] = await db.query<{ v: { file_name: string }[] }>(media("files"));
      expect(photos.map((p) => p.file_name)).toEqual(["a.jpg"]);
      expect(photos[0].author.first_name).toBe("Tina");
      expect(files.map((f) => f.file_name)).toEqual(["plan.pdf"]);
    });
  });

  it("shows nothing from chats you can't read", async () => {
    await withSetup(setup, USERS.tech2, async (db) => {
      const [{ v }] = await db.query<{ v: unknown[] }>(media("photos"));
      expect(v).toEqual([]);
    });
  });
});

describe("material requests", () => {
  const req = "74000000-0000-4000-8000-000000000001";
  const create = (id = req, project: string = PROJECTS.valletta) =>
    `select public.create_material_request('${id}', '${project}', public.malta_today() + 3, false, 'Leave at gate 2',
      '[{"name":"Plasterboard 12.5mm","quantity":40,"unit":"sheets"},{"name":"Drywall screws","quantity":2,"unit":"boxes"}]'::jsonb) as v`;
  const finish = async (db: { query: <T>(s: string) => Promise<T[]> }) => {
    await db.query("set constraints all immediate"); // fire the end-of-transaction notification trigger
  };

  it("a technician on the project requests materials; it gets #1 and the project's managers are notified", async () => {
    await asUser(USERS.tech1, async (db) => {
      const [{ v }] = await db.query<{ v: { number: number } }>(create());
      expect(v.number).toBe(1);
      // Asking again with the same id (offline retry) doesn't create a second request.
      await db.query(create());
      expect(await count(db, "select 1 from public.material_requests")).toBe(1);
      await finish(db);
      await db.query("reset role");
      const n = await db.query<{ user_id: string; title: string; body: string }>("select user_id, title, body from public.notifications where type = 'material.new'");
      expect(n.map((x) => x.user_id)).toEqual([USERS.manager]); // the manager on Valletta
      expect(n[0].title).toBe("Material request #1 from Tina Camilleri · Valletta Office Fit-out");
      expect(n[0].body).toMatch(/^Plasterboard 12.5mm ×40 sheets, Drywall screws ×2 boxes · needed by/);
    });
  });

  it("people not on the project can't see or create requests; basic users can't create", async () => {
    await withSetup(`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${USERS.tech1}","role":"authenticated"}', true); ${create()}; reset role;`, USERS.tech2, async (db) => {
      expect(await count(db, "select 1 from public.material_requests")).toBe(0);
      expect(await count(db, "select 1 from public.material_request_items")).toBe(0);
      expect(await db.fails(create("74000000-0000-4000-8000-000000000009", PROJECTS.valletta))).toMatch(/row-level security/);
    });
    await asUser(USERS.basic, async (db) => {
      expect(await db.fails(create())).toMatch(/row-level security/);
    });
  });

  it("the requester can't mark it ordered or record deliveries; a manager can, and the requester is told", async () => {
    const setup = `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${USERS.tech1}","role":"authenticated"}', true); ${create()}; reset role;`;
    await withSetup(setup, USERS.tech1, async (db) => {
      expect(await db.fails(`update public.material_requests set status = 'ordered' where id = '${req}'`)).toMatch(/Only managers/);
      await db.query(`update public.material_request_items set delivered_qty = 40 where request_id = '${req}'`);
      expect(await count(db, `select 1 from public.material_request_items where request_id = '${req}' and delivered_qty > 0`)).toBe(0);
      // …but can still fix their own request while it's waiting, or cancel it.
      await db.query(`update public.material_request_items set quantity = 45 where request_id = '${req}' and name like 'Plaster%'`);
      expect(await count(db, `select 1 from public.material_request_items where quantity = 45`)).toBe(1);
    });
    await withSetup(setup, USERS.manager, async (db) => {
      await db.query(`update public.material_requests set status = 'ordered', supplier = 'Build Supplies Ltd', po_number = 'PO-881', expected_date = '2027-01-15' where id = '${req}'`);
      await db.query(`update public.material_request_items set delivered_qty = 40 where request_id = '${req}' and name like 'Plaster%'`);
      await db.query(`update public.material_requests set status = 'partly_delivered' where id = '${req}'`);
      await db.query("reset role");
      const n = await db.query<{ title: string; body: string }>(`select title, body from public.notifications where type = 'material.status' and user_id = '${USERS.tech1}' order by created_at, title`);
      expect(n.map((x) => x.title)).toEqual(["Your material request #1 was ordered", "Your material request #1 was partly delivered"]);
      expect(n[0].body).toBe("Build Supplies Ltd · expected 15 Jan · PO PO-881");
      const [{ v }] = await db.query<{ v: { name: string; delivered: number }[] }>(`select public.get_project_materials('${PROJECTS.valletta}') as v`);
      expect(v).toEqual([expect.objectContaining({ name: "Plasterboard 12.5mm", delivered: 40 })]);
    });
  });

  it("once it's being handled, the requester can't change it any more", async () => {
    const setup = `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${USERS.tech1}","role":"authenticated"}', true); ${create()};
      select set_config('request.jwt.claims', '{"sub":"${USERS.manager}","role":"authenticated"}', true);
      update public.material_requests set status = 'ordered' where id = '${req}'; reset role;`;
    await withSetup(setup, USERS.tech1, async (db) => {
      expect(await db.fails(`update public.material_requests set status = 'cancelled' where id = '${req}'`)).toMatch(/already being handled/);
      expect(await db.query(`update public.material_request_items set quantity = 1 where request_id = '${req}' returning id`)).toHaveLength(0);
    });
  });

  it("a manager who isn't on the project can't see or handle its requests", async () => {
    const other = "20000000-0000-4000-8000-0000000000bb";
    const setup = `insert into public.projects (id, name, created_by) values ('${other}', 'Gozo Villa', '${USERS.admin}');
      insert into public.material_requests (id, project_id, requested_by, number) values ('${req}', '${other}', '${USERS.admin}', 1);`;
    await withSetup(setup, USERS.manager, async (db) => {
      expect(await count(db, "select 1 from public.material_requests")).toBe(0);
      expect(await db.query(`update public.material_requests set status = 'ordered' where id = '${req}' returning id`)).toHaveLength(0);
    });
  });

  it("comments notify the requester and managers; the morning job flags materials needed tomorrow that aren't ordered", async () => {
    const setup = `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${USERS.tech1}","role":"authenticated"}', true); ${create()};
      update public.material_requests set needed_by = public.malta_today() + 1 where id = '${req}'; reset role;`;
    await withSetup(setup, USERS.manager, async (db) => {
      await db.query(`insert into public.material_request_comments (request_id, body) values ('${req}', 'Is 15mm OK instead?')`);
      await db.query("reset role");
      await db.query("select public.create_due_notifications()");
      const rows = await db.query<{ user_id: string; title: string }>("select user_id, title from public.notifications where type in ('material.comment', 'material.status') order by title");
      expect(rows).toEqual([
        { user_id: USERS.tech1, title: "Mark Borg commented on material request #1" },
        { user_id: USERS.manager, title: "Material needed tomorrow, not ordered yet: #1 · Valletta Office Fit-out" },
      ]);
    });
  });
});

describe("product catalogue and materials report", () => {
  const plaster = "75000000-0000-4000-8000-000000000001";
  const products = `insert into public.products (id, name, unit, category) values ('${plaster}', 'Plasterboard 12.5mm', 'sheets', 'Drylining');`;
  const req = "75100000-0000-4000-8000-000000000001";
  const asTech = (sql: string) => `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${USERS.tech1}","role":"authenticated"}', true); ${sql}; reset role;`;
  const create = `select public.create_material_request('${req}', '${PROJECTS.valletta}', null, false, null,
      '[{"name":"Plasterboard 12.5mm","quantity":40,"unit":"sheets","product_id":"${plaster}"},
        {"name":"drywall screws","quantity":3,"unit":"boxes"},
        {"name":"Bonding plaster","quantity":5,"unit":"bags"}]'::jsonb)`;

  it("everyone signed in can read products; only managers add or change them; only admins delete", async () => {
    await withSetup(products, USERS.tech1, async (db) => {
      expect(await count(db, "select 1 from public.products")).toBe(1);
      expect(await db.fails("insert into public.products (name) values ('Cement')")).toMatch(/row-level security/);
      expect(await db.query("update public.products set name = 'x' returning id")).toHaveLength(0);
    });
    await withSetup(products, USERS.manager, async (db) => {
      expect(await db.fails("insert into public.products (name, unit, category) values ('Cement', 'bags', 'Building')")).toBeNull();
      expect(await db.query("delete from public.products returning id")).toHaveLength(0);
    });
    await withSetup(products, USERS.admin, async (db) => {
      expect(await db.query("delete from public.products where name = 'Plasterboard 12.5mm' returning id")).toHaveLength(1);
    });
  });

  it("requests record the chosen product; typed items matching a product (or added later) are linked automatically", async () => {
    await withSetup(`${products} ${asTech(create)}`, USERS.manager, async (db) => {
      const linked = await db.query<{ name: string; product_id: string | null }>(`select name, product_id from public.material_request_items where request_id = '${req}' order by position`);
      expect(linked.map((r) => !!r.product_id)).toEqual([true, false, false]);
      // A manager adds "Drywall screws" (boxes) to the catalogue → the typed item is linked.
      await db.query("insert into public.products (name, unit, category) values ('Drywall screws', 'boxes', 'Fixings')");
      const again = await db.query<{ product_id: string | null }>(`select product_id from public.material_request_items where request_id = '${req}' order by position`);
      expect(again.map((r) => !!r.product_id)).toEqual([true, true, false]);
    });
  });

  it("the report adds up delivered quantities per product, within the dates, and shows typed items too", async () => {
    const deliver = `update public.material_requests set status = 'ordered' where id = '${req}';
      update public.material_request_items set delivered_qty = quantity where request_id = '${req}' and name <> 'Bonding plaster';
      update public.material_request_items set delivered_qty = 2 where request_id = '${req}' and name = 'Bonding plaster';
      update public.material_requests set status = 'partly_delivered' where id = '${req}';`;
    await withSetup(`${products} ${asTech(create)}`, USERS.manager, async (db) => {
      await db.query(deliver);
      type Line = { name: string; delivered: number; requested: number; in_catalogue: boolean; category: string | null };
      const [{ v }] = await db.query<{ v: Line[] }>(`select public.get_material_report('${PROJECTS.valletta}') as v`);
      expect(v.map((l) => [l.name, Number(l.delivered), Number(l.requested), l.in_catalogue])).toEqual([
        ["Plasterboard 12.5mm", 40, 40, true],
        ["Bonding plaster", 2, 5, false],
        ["drywall screws", 3, 3, false],
      ]);
      const [{ v: none }] = await db.query<{ v: Line[] }>(`select public.get_material_report('${PROJECTS.valletta}', public.malta_today() + 1, null) as v`);
      expect(none).toEqual([]);
    });
    // Someone not on the project gets nothing.
    await withSetup(`${products} ${asTech(create)}`, USERS.tech2, async (db) => {
      const [{ v }] = await db.query<{ v: unknown[] }>(`select public.get_material_report('${PROJECTS.valletta}') as v`);
      expect(v).toEqual([]);
    });
  });
});

describe("inserting a task between others, and moving tasks", () => {
  // Valletta "In progress" group: Partition walls (pos 1), Electrical first fix (2), Data cabling (3); Data cabling waits for Electrical.
  const order = async (db: { query: <T>(s: string) => Promise<T[]> }) =>
    (await db.query<{ title: string }>(`select title from public.tasks where group_id = '${GROUPS.vallettaInProgress}' order by position, created_at`)).map((r) => r.title);
  const elec = "40000000-0000-4000-8000-000000000004";
  const partition = TASKS.vallettaPartitions;

  it("inserts below a task, in the right place, and rewires A → new → B", async () => {
    await asUser(USERS.manager, async (db) => {
      const [{ v: id }] = await db.query<{ v: string }>(`select public.insert_task_at('${elec}', 'below', 'Containment inspection') as v`);
      expect(await order(db)).toEqual(["Partition walls", "Electrical first fix", "Containment inspection", "Data cabling"]);
      const links = await db.query<{ t: string; d: string }>(
        `select t.title as t, d2.title as d from public.task_dependencies d join public.tasks t on t.id = d.task_id join public.tasks d2 on d2.id = d.depends_on_task_id
         where t.group_id = '${GROUPS.vallettaInProgress}' order by 1`,
      );
      expect(links).toEqual([
        { t: "Containment inspection", d: "Electrical first fix" },
        { t: "Data cabling", d: "Containment inspection" },
      ]);
      expect(id).toBeTruthy();
    });
  });

  it("inserts above a task; technicians can insert but links are left to managers", async () => {
    await asUser(USERS.tech1, async (db) => {
      await db.query(`select public.insert_task_at('${partition}', 'above', 'Set out walls')`);
      expect(await order(db)).toEqual(["Set out walls", "Partition walls", "Electrical first fix", "Data cabling"]);
    });
  });

  it("moves a task before another, or to the end, and only for people who can edit", async () => {
    await asUser(USERS.tech1, async (db) => {
      await db.query(`select public.move_task('${partition}', '${GROUPS.vallettaInProgress}', null)`);
      expect(await order(db)).toEqual(["Electrical first fix", "Data cabling", "Partition walls"]);
      await db.query(`select public.move_task('${partition}', '${GROUPS.vallettaInProgress}', '${elec}')`);
      expect(await order(db)).toEqual(["Partition walls", "Electrical first fix", "Data cabling"]);
    });
    await asUser(USERS.basic, async (db) => {
      expect(await db.fails(`select public.move_task('${partition}', '${GROUPS.vallettaInProgress}', null)`)).toMatch(/can't move tasks/);
    });
    await asUser(USERS.tech2, async (db) => {
      expect(await db.fails(`select public.move_task('${partition}', '${GROUPS.vallettaInProgress}', null)`)).toMatch(/Task not found/);
    });
  });
});

// ---------------------------------------------------------------------------
describe("daily update reminder", () => {
  type Row = Record<string, unknown>;
  const at = (local: string) => `'${local}'::timestamp at time zone 'Europe/Malta'`;
  const run = (local: string) => `select public.queue_daily_update_reminders(${at(local)});`;
  const reminders = async (db: { query: (s: string) => Promise<Row[]> }) =>
    (await db.query("select title from public.notifications where type = 'daily.reminder'")).length;

  it("only the server may run it", async () => {
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails("select public.queue_daily_update_reminders()")).toMatch(/permission denied/);
      expect(await db.fails("select * from public.job_secrets")).toMatch(/permission denied/);
    });
  });

  it("reminds technicians on active projects who haven't posted, once, at the chosen time on working days", async () => {
    // Wednesday 9 Jan 2030. tech2 already posted that day; tech1 hasn't.
    const setup = `
      insert into public.daily_updates (project_id, author_id, work_date, work_done)
        values ('${PROJECTS.mosta}', '${USERS.tech2}', '2030-01-09', 'Rails done');
      ${run("2030-01-09 16:00")} ${run("2030-01-09 16:30")} ${run("2030-01-09 16:45")}`;
    await withSetup(setup, USERS.tech1, async (db) => expect(await reminders(db)).toBe(1));
    await withSetup(setup, USERS.tech2, async (db) => expect(await reminders(db)).toBe(0));
    await withSetup(setup, USERS.manager, async (db) => expect(await reminders(db)).toBe(0));
    await withSetup(setup, USERS.basic, async (db) => expect(await reminders(db)).toBe(0));
  });

  it("follows the time an administrator sets, skips weekends and can be switched off", async () => {
    await withSetup(`update public.app_settings set daily_reminder_time = '17:15'; ${run("2030-01-09 16:45")}`, USERS.tech1, async (db) =>
      expect(await reminders(db)).toBe(0),
    );
    await withSetup(`update public.app_settings set daily_reminder_time = '17:15'; ${run("2030-01-09 17:15")}`, USERS.tech1, async (db) =>
      expect(await reminders(db)).toBe(1),
    );
    await withSetup(run("2030-01-12 16:45"), USERS.tech1, async (db) => expect(await reminders(db)).toBe(0)); // Saturday
    await withSetup(`update public.app_settings set daily_reminder_enabled = false; ${run("2030-01-09 16:45")}`, USERS.tech1, async (db) =>
      expect(await reminders(db)).toBe(0),
    );
  });

  it("only administrators can change the reminder settings", async () => {
    await asUser(USERS.manager, async (db) => {
      expect(await db.query("update public.app_settings set daily_reminder_time = '09:00' where id returning id")).toHaveLength(0);
    });
    await asUser(USERS.admin, async (db) => {
      expect(await db.query("update public.app_settings set daily_reminder_time = '17:00' where id returning id")).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
describe("who is using the app (Admin → Activity)", () => {
  type Person = { id: string; last_seen_at: string | null; last_update: string | null; push_on: boolean; projects: string[] };

  it("opening the app records only your own 'last active' time", async () => {
    await withSetup("", USERS.tech1, async (db) => {
      await db.query("select public.touch_last_seen()");
      expect(await db.fails("select * from public.user_activity")).toMatch(/permission denied/);
      expect(await db.fails(`insert into public.user_activity (user_id) values ('${USERS.tech2}')`)).toMatch(/permission denied/);
    });
  });

  it("only administrators can see everyone's activity", async () => {
    for (const u of [USERS.manager, USERS.tech1, USERS.basic]) {
      await asUser(u, async (db) => {
        expect(await db.fails("select public.get_user_activity()")).toMatch(/Only administrators/);
      });
    }
  });

  it("shows last active, last daily update, notifications and projects — least active first", async () => {
    const setup = `
      set local role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${USERS.tech1}","role":"authenticated"}', true);
      select public.touch_last_seen();
      reset role;
      insert into public.daily_updates (project_id, author_id, work_date, work_done)
        values ('${PROJECTS.valletta}', '${USERS.tech1}', '2030-01-09', 'Partitions');`;
    await withSetup(setup, USERS.admin, async (db) => {
      const [{ list }] = await db.query<{ list: Person[] }>("select public.get_user_activity() as list");
      const tech1 = list.find((p) => p.id === USERS.tech1)!;
      const tech2 = list.find((p) => p.id === USERS.tech2)!;
      expect(tech1.last_seen_at).not.toBeNull();
      expect(tech1.last_update).toBe("2030-01-09");
      expect(tech1.projects.length).toBeGreaterThan(0);
      expect(tech2.last_seen_at).toBeNull();
      expect(tech1.push_on).toBe(false);
      expect(list.findIndex((p) => p.id === USERS.tech2)).toBeLessThan(list.findIndex((p) => p.id === USERS.tech1)); // never seen comes first
      expect(list.some((p) => p.id === USERS.pending)).toBe(false); // waiting for approval: not listed
    });
  });
});

// ---------------------------------------------------------------------------
describe("important messages (administrators only)", () => {
  type Row = Record<string, unknown>;
  const send = (users: string[], remind = 2) =>
    `select public.send_announcement('Site closed', 'Do not go to Valletta tomorrow.', array[${users.map((u) => `'${u}'::uuid`).join(",")}], ${remind}::smallint)`;
  const asAdmin = `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${USERS.admin}","role":"authenticated"}', true);`;

  it("only administrators can send", async () => {
    for (const u of [USERS.manager, USERS.tech1]) {
      await asUser(u, async (db) => {
        expect(await db.fails(send([USERS.tech2]))).toMatch(/Only administrators/);
        expect(await db.fails("insert into public.announcements (title, body) values ('x', 'y')")).toMatch(/permission denied|row-level security/);
      });
    }
  });

  it("recipients get a notification, see only their own messages and can mark them read", async () => {
    const setup = `${asAdmin} ${send([USERS.tech1])}; reset role;`;
    await withSetup(setup, USERS.tech1, async (db) => {
      const [a] = await db.query<{ id: string; title: string }>("select id, title from public.announcements");
      expect(a.title).toBe("Site closed");
      expect((await db.query("select 1 from public.notifications where type = 'announcement'")).length).toBe(1);
      expect(await db.fails(`update public.announcement_recipients set read_at = now() where announcement_id = '${a.id}'`)).toMatch(/permission denied/);
      expect((await db.query<Row>("select read_at from public.announcement_recipients"))[0].read_at).toBeNull();
      await db.query(`select public.mark_announcement_read('${a.id}')`);
      const [r] = await db.query<Row>("select read_at from public.announcement_recipients");
      expect(r.read_at).not.toBeNull();
    });
    await withSetup(setup, USERS.tech2, async (db) => {
      expect(await db.query("select id from public.announcements")).toHaveLength(0);
      expect(await db.query("select 1 from public.announcement_recipients")).toHaveLength(0);
      expect(await db.query("select 1 from public.notifications where type = 'announcement'")).toHaveLength(0);
    });
  });

  it("administrators see who has read it", async () => {
    await withSetup(`${asAdmin} ${send([USERS.tech1, USERS.tech2])}; reset role;`, USERS.admin, async (db) => {
      expect(await db.query("select user_id from public.announcement_recipients")).toHaveLength(2);
    });
  });

  it("unread messages are sent again during working hours only, and only the server may do it", async () => {
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails("select public.queue_announcement_reminders()")).toMatch(/permission denied/);
    });
    const when = (t: string) => `((now() at time zone 'Europe/Malta')::date + time '${t}') at time zone 'Europe/Malta'`;
    const setup = (t: string) => `${asAdmin} ${send([USERS.tech1, USERS.tech2])}; reset role;
      update public.announcement_recipients set last_sent_at = ${when(t)} - interval '3 hours';
      update public.announcement_recipients set read_at = now() where user_id = '${USERS.tech2}';
      select public.queue_announcement_reminders(${when(t)}); select public.queue_announcement_reminders(${when(t)});`;
    const count = async (db: { query: (s: string) => Promise<Row[]> }) =>
      (await db.query("select 1 from public.notifications where type = 'announcement'")).length;
    // Midday: tech1 (unread) gets one reminder (not two); tech2 (read) gets none.
    await withSetup(setup("12:00"), USERS.tech1, async (db) => expect(await count(db)).toBe(2));
    await withSetup(setup("12:00"), USERS.tech2, async (db) => expect(await count(db)).toBe(1));
    // Night: nothing new.
    await withSetup(setup("23:30"), USERS.tech1, async (db) => expect(await count(db)).toBe(1));
  });
});

// ---------------------------------------------------------------------------
describe("general tasks (not linked to a project)", () => {
  type Row = Record<string, unknown>;
  const as = (u: string) => `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`;
  const ID = "60000000-0000-4000-8000-000000000001";
  // The manager creates a task and gives it to tech1.
  const create = `${as(USERS.manager)}
    insert into public.general_tasks (id, title, created_by) values ('${ID}', 'Chase ABC Ltd for tender update', '${USERS.manager}');
    insert into public.general_task_assignees (task_id, user_id) values ('${ID}', '${USERS.tech1}');
    reset role;`;

  it("only managers and administrators can create them", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(`insert into public.general_tasks (title, created_by) values ('x', '${USERS.tech1}')`)).toMatch(/row-level security/);
    });
    await asUser(USERS.manager, async (db) => {
      expect(await db.query(`insert into public.general_tasks (title, created_by) values ('x', '${USERS.manager}') returning id`)).toHaveLength(1);
    });
  });

  it("the person assigned is notified and sees it; others don't", async () => {
    await withSetup(create, USERS.tech1, async (db) => {
      expect(await db.query("select title from public.general_tasks")).toEqual([{ title: "Chase ABC Ltd for tender update" }]);
      const notes = await db.query<Row>("select type, title from public.notifications where link like '/my-tasks?general=%'");
      expect(notes).toEqual([{ type: "task.assigned", title: expect.stringMatching(/gave you a task: Chase ABC Ltd/) }]);
      const [{ list }] = await db.query<{ list: Row[] }>("select public.get_general_tasks() as list");
      expect(list).toHaveLength(1);
    });
    for (const u of [USERS.tech2, USERS.basic]) {
      await withSetup(create, u, async (db) => {
        expect(await db.query("select 1 from public.general_tasks")).toHaveLength(0);
        expect(await db.query("select 1 from public.general_task_assignees")).toHaveLength(0);
        const [{ list }] = await db.query<{ list: Row[] }>("select public.get_general_tasks(true) as list");
        expect(list).toHaveLength(0);
      });
    }
    await withSetup(create, USERS.admin, async (db) => {
      const [{ list }] = await db.query<{ list: Row[] }>("select public.get_general_tasks(true) as list");
      expect(list).toHaveLength(1);
    });
  });

  it("an assignee can change the status, tick the checklist and comment — but not the details", async () => {
    await withSetup(create, USERS.tech1, async (db) => {
      await db.query(`update public.general_tasks set status = 'done', checklist = '[{"text":"Call","done":true}]' where id = '${ID}'`);
      const [t] = await db.query<Row>(`select status, completed_at from public.general_tasks where id = '${ID}'`);
      expect(t.status).toBe("done");
      expect(t.completed_at).not.toBeNull();
      expect(await db.fails(`update public.general_tasks set title = 'Other' where id = '${ID}'`)).toMatch(/Only the person who created/);
      expect(await db.fails(`insert into public.general_task_assignees (task_id, user_id) values ('${ID}', '${USERS.tech2}')`)).toMatch(/row-level security/);
      expect(await db.query(`delete from public.general_tasks where id = '${ID}' returning id`)).toHaveLength(0);
      await db.query(`insert into public.general_task_comments (task_id, author_id, body) values ('${ID}', '${USERS.tech1}', 'Called — reply Monday')`);
    });
    // The creator hears about it.
    await withSetup(`${create} ${as(USERS.tech1)} update public.general_tasks set status = 'done' where id = '${ID}';
      insert into public.general_task_comments (task_id, author_id, body) values ('${ID}', '${USERS.tech1}', 'Done'); reset role;`, USERS.manager, async (db) => {
      const types = (await db.query<Row>("select type from public.notifications where link like '/my-tasks?general=%' order by created_at")).map((r) => r.type);
      expect(types.sort()).toEqual(["task.comment", "task.status"]);
    });
  });

  it("other people can't comment, and the creator can edit and delete", async () => {
    await withSetup(create, USERS.tech2, async (db) => {
      expect(await db.fails(`insert into public.general_task_comments (task_id, author_id, body) values ('${ID}', '${USERS.tech2}', 'x')`)).toMatch(/row-level security/);
    });
    await withSetup(create, USERS.manager, async (db) => {
      await db.query(`update public.general_tasks set title = 'Chase ABC Ltd (urgent)', due_date = '2030-01-09' where id = '${ID}'`);
      expect(await db.query(`delete from public.general_tasks where id = '${ID}' returning id`)).toHaveLength(1);
    });
  });

  it("due reminders go to the people assigned, once, and only the server may run them", async () => {
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails("select public.create_general_task_due_notifications()")).toMatch(/permission denied/);
    });
    await withSetup(`${create} update public.general_tasks set due_date = public.malta_today() + 1;
      select public.create_general_task_due_notifications(); select public.create_general_task_due_notifications();`, USERS.tech1, async (db) => {
      expect(await db.query("select title from public.notifications where type = 'task.due_soon'")).toEqual([{ title: "Due tomorrow: Chase ABC Ltd for tender update" }]);
    });
  });
});

// ---------------------------------------------------------------------------
describe("important messages: when repeats are sent", () => {
  type Row = Record<string, unknown>;
  const asAdmin = `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${USERS.admin}","role":"authenticated"}', true);`;
  // 2030-01-09 is a Wednesday, 2030-01-12 a Saturday.
  const at = (local: string) => `'${local}'::timestamp at time zone 'Europe/Malta'`;
  const scenario = (sendArgs: string, runAt: string, extra = "") => `
    ${extra}
    ${asAdmin} select public.send_announcement('Site closed', 'Stay away.', array['${USERS.tech1}'::uuid], 2::smallint${sendArgs}); reset role;
    update public.announcements set created_at = ${at("2030-01-09 06:00")};
    update public.announcement_recipients set last_sent_at = ${at(runAt)} - interval '3 hours';
    select public.queue_announcement_reminders(${at(runAt)});`;
  const repeats = async (db: { query: (s: string) => Promise<Row[]> }) =>
    (await db.query("select 1 from public.notifications where type = 'announcement' and title like 'Reminder%'")).length;

  it("uses the default window from Admin → Settings (07:00–17:00)", async () => {
    await withSetup(scenario("", "2030-01-09 16:45"), USERS.tech1, async (db) => expect(await repeats(db)).toBe(1));
    await withSetup(scenario("", "2030-01-09 17:30"), USERS.tech1, async (db) => expect(await repeats(db)).toBe(0));
    await withSetup(scenario("", "2030-01-09 17:30", "update public.app_settings set message_repeat_to = '18:00';"), USERS.tech1, async (db) =>
      expect(await repeats(db)).toBe(1),
    );
  });

  it("can be changed for one message, including weekdays only and how many days", async () => {
    const evening = ", '18:00'::time, '21:00'::time";
    await withSetup(scenario(evening, "2030-01-09 20:00"), USERS.tech1, async (db) => expect(await repeats(db)).toBe(1));
    await withSetup(scenario(evening, "2030-01-09 12:00"), USERS.tech1, async (db) => expect(await repeats(db)).toBe(0));
    await withSetup(scenario(", null, null, true, 7::smallint", "2030-01-12 10:00"), USERS.tech1, async (db) => expect(await repeats(db)).toBe(0)); // Saturday, weekdays only
    await withSetup(scenario(", null, null, false, 7::smallint", "2030-01-12 10:00"), USERS.tech1, async (db) => expect(await repeats(db)).toBe(1)); // Saturday allowed
    await withSetup(scenario(", null, null, null, 1::smallint", "2030-01-11 10:00"), USERS.tech1, async (db) => expect(await repeats(db)).toBe(0)); // after 1 day: stop
  });

  it("rejects a window that ends before it starts", async () => {
    await asUser(USERS.admin, async (db) => {
      expect(await db.fails("update public.app_settings set message_repeat_from = '18:00', message_repeat_to = '08:00' where id")).toMatch(/message_window/);
    });
  });
});

// ---------------------------------------------------------------------------
describe("audit trail and recycle bin", () => {
  type Row = Record<string, unknown>;
  const as = (u: string) => `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`;
  const T = TASKS.vallettaPartitions;
  // tech1 is on the task; the manager adds a checklist step and comment, then deletes it.
  const del = `${as(USERS.manager)}
    insert into public.task_assignees (task_id, user_id) values ('${T}', '${USERS.tech1}') on conflict do nothing;
    insert into public.task_checklist_items (task_id, title) values ('${T}', 'Measure');
    insert into public.comments (task_id, author_id, body) values ('${T}', '${USERS.manager}', 'Keep this');
    update public.tasks set progress = 40 where id = '${T}';
    delete from public.tasks where id = '${T}';
    reset role;`;

  it("only administrators can read the audit log and recycle bin", async () => {
    for (const u of [USERS.manager, USERS.tech1]) {
      await withSetup(del, u, async (db) => {
        expect(await db.query("select 1 from public.audit_log")).toHaveLength(0);
        expect(await db.query("select 1 from public.deleted_tasks")).toHaveLength(0);
        expect(await db.fails("insert into public.audit_log (action, entity) values ('x', 'y')")).toMatch(/permission denied/);
      });
    }
  });

  it("records who changed and deleted a task, with readable details", async () => {
    await withSetup(del, USERS.admin, async (db) => {
      const rows = await db.query<Row>(`select action, actor_name, title, changes from public.audit_log where entity = 'task' and entity_id = '${T}' order by id`);
      const actions = rows.map((r) => r.action);
      expect(actions).toEqual(expect.arrayContaining(["assigned", "updated", "deleted"]));
      const upd = rows.find((r) => r.action === "updated")!;
      expect(upd.changes).toEqual({ progress: [expect.anything(), 40] });
      expect(rows.at(-1)).toMatchObject({ action: "deleted", actor_name: expect.stringMatching(/\S/) });
      const [bin] = await db.query<Row>(`select title, deleted_by from public.deleted_tasks where task_id = '${T}'`);
      expect(bin.deleted_by).toBe(USERS.manager);
    });
  });

  it("an administrator can restore a deleted task with its checklist, comments and people", async () => {
    await withSetup(`${del} ${as(USERS.admin)} select public.restore_task('${T}'); reset role;`, USERS.tech1, async (db) => {
      expect(await db.query(`select title from public.tasks where id = '${T}'`)).toHaveLength(1);
      expect(await db.query(`select 1 from public.task_checklist_items where task_id = '${T}' and title = 'Measure'`)).toHaveLength(1);
      expect(await db.query(`select 1 from public.comments where task_id = '${T}' and body = 'Keep this'`)).toHaveLength(1);
      expect(await db.query(`select 1 from public.task_assignees where task_id = '${T}' and user_id = '${USERS.tech1}'`)).toHaveLength(1);
      expect((await db.query<Row>(`select action from public.activity_log where task_id = '${T}' order by id desc limit 1`))[0].action).toBe("task.restored");
    });
    await withSetup(del, USERS.manager, async (db) => {
      expect(await db.fails(`select public.restore_task('${T}')`)).toMatch(/Only administrators/);
    });
  });

  it("deleting a group keeps its tasks in the recycle bin; restoring puts them in another group", async () => {
    await withSetup(`${as(USERS.manager)} delete from public.groups where id = '${GROUPS.vallettaInProgress}'; reset role;
        ${as(USERS.admin)} select public.restore_task('${T}'); reset role;`, USERS.admin, async (db) => {
      const [t] = await db.query<Row>(`select group_id from public.tasks where id = '${T}'`);
      expect(t.group_id).not.toBe(GROUPS.vallettaInProgress);
      expect(await db.query("select 1 from public.audit_log where entity = 'group' and action = 'deleted'")).toHaveLength(1);
    });
  });

  it("records level changes and people added to projects", async () => {
    await withSetup(`${as(USERS.admin)} update public.profiles set role = 'manager' where id = '${USERS.tech2}';
        insert into public.project_members (project_id, user_id) values ('${PROJECTS.valletta}', '${USERS.tech2}'); reset role;`, USERS.admin, async (db) => {
      const rows = await db.query<Row>("select entity, action, changes from public.audit_log where entity in ('user', 'project_member') and created_at = now() order by id");
      expect(rows).toEqual([
        { entity: "user", action: "updated", changes: { role: ["technician", "manager"] } },
        { entity: "project_member", action: "added", changes: {} },
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
describe("duplicate a task in the same project", () => {
  it("a technician on the project can copy a task into the same project, with its checklist unticked", async () => {
    const T = TASKS.vallettaPartitions;
    await withSetup(
      `insert into public.task_checklist_items (task_id, title, is_done) values ('${T}', 'Measure', true);`,
      USERS.tech1,
      async (db) => {
        const [{ r }] = await db.query<{ r: { project_id: string; task_id: string }[] }>(
          `select public.copy_task_to_projects('${T}', '[{"project_id":"${PROJECTS.valletta}","group_id":"${GROUPS.vallettaInProgress}"}]'::jsonb) as r`,
        );
        expect(r[0].project_id).toBe(PROJECTS.valletta);
        const [copy] = await db.query<{ title: string; group_id: string }>(`select title, group_id from public.tasks where id = '${r[0].task_id}'`);
        const [orig] = await db.query<{ title: string }>(`select title from public.tasks where id = '${T}'`);
        expect(copy.title).toBe(orig.title);
        expect(await db.query(`select is_done from public.task_checklist_items where task_id = '${r[0].task_id}'`)).toEqual([{ is_done: false }]);
      },
    );
  });
  it("someone not on the project can't", async () => {
    await asUser(USERS.tech2, async (db) => {
      expect(await db.fails(`select public.copy_task_to_projects('${TASKS.vallettaPartitions}', '[{"project_id":"${PROJECTS.valletta}"}]'::jsonb)`)).toMatch(/Task not found|can't add/);
    });
  });
});

// ---------------------------------------------------------------------------
describe("material requests: delivery documents and received on site", () => {
  type Row = Record<string, unknown>;
  const req = "75000000-0000-4000-8000-000000000001";
  const as = (u: string) => `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`;
  const setup = `${as(USERS.tech1)}
    select public.create_material_request('${req}', '${PROJECTS.valletta}', null, false, null,
      '[{"name":"Plasterboard 12.5mm","quantity":40,"unit":"sheets"},{"name":"Drywall screws","quantity":2,"unit":"boxes"}]'::jsonb);
    set constraints all immediate;
    reset role;`;
  const items = `(select jsonb_agg(jsonb_build_object('item_id', id, 'delivered_qty', case when name like 'Plaster%' then 40 else 1 end)) from public.material_request_items where request_id = '${req}')`;

  it("anyone on the project can attach a delivery note; managers are told; others can't", async () => {
    await withSetup(`${setup} ${as(USERS.tech1)}
        insert into public.material_request_documents (id, request_id, project_id, kind, storage_path, file_name, uploaded_by)
        values (gen_random_uuid(), '${req}', '${PROJECTS.valletta}', 'delivery_note', '${PROJECTS.valletta}/materials/${req}/docs/a.jpg', 'Delivery note.jpg', '${USERS.tech1}');
        reset role;`, USERS.manager, async (db) => {
      expect(await db.query("select file_name from public.material_request_documents")).toEqual([{ file_name: "Delivery note.jpg" }]);
      const notes = await db.query<Row>("select title from public.notifications where title like '%delivery note%'");
      expect(notes).toHaveLength(1);
    });
    await withSetup(setup, USERS.tech2, async (db) => {
      expect(
        await db.fails(`insert into public.material_request_documents (id, request_id, project_id, storage_path, file_name, uploaded_by)
          values (gen_random_uuid(), '${req}', '${PROJECTS.valletta}', 'x/y.pdf', 'y.pdf', '${USERS.tech2}')`),
      ).toMatch(/row-level security/);
    });
  });

  it("the technician on site marks it received; short items make it Partly delivered; managers are told", async () => {
    await withSetup(`${setup} ${as(USERS.tech1)} select public.receive_material_request('${req}', ${items}, 'Screws: 1 box short'); reset role;`, USERS.manager, async (db) => {
      const [r] = await db.query<Row>(`select status, received_by from public.material_requests where id = '${req}'`);
      expect(r).toEqual({ status: "partly_delivered", received_by: USERS.tech1 });
      expect(await db.query("select 1 from public.notifications where title like 'Received on site%'")).toHaveLength(1);
      expect(await db.query(`select body from public.material_request_comments where request_id = '${req}'`)).toEqual([{ body: "Screws: 1 box short" }]);
    });
    const all = `(select jsonb_agg(jsonb_build_object('item_id', id, 'delivered_qty', quantity)) from public.material_request_items where request_id = '${req}')`;
    await withSetup(`${setup} ${as(USERS.tech1)} select public.receive_material_request('${req}', ${all}); reset role;`, USERS.tech1, async (db) => {
      expect((await db.query<Row>(`select status from public.material_requests where id = '${req}'`))[0].status).toBe("delivered");
    });
  });

  it("people not on the project, and Basic users, can't mark it received", async () => {
    for (const u of [USERS.tech2, USERS.basic]) {
      await withSetup(setup, u, async (db) => {
        expect(await db.fails(`select public.receive_material_request('${req}', '[]'::jsonb)`)).toMatch(/Request not found/);
      });
    }
  });
});

// ---------------------------------------------------------------------------
describe("variations (VO-001 …)", () => {
  type Row = Record<string, unknown>;
  const T = TASKS.vallettaPartitions;
  const as = (u: string) => `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`;
  const make = (title = "null") =>
    `select public.create_variation('${PROJECTS.valletta}', '${T}', ${title}, 'Client wants 2 extra doors', 'Mr Borg (client)', '2030-01-09')`;

  it("a manager creates VO-001 from a task: the original stays as it was; numbers go up", async () => {
    await withSetup(`${as(USERS.manager)} ${make()}; ${make("'Extra socket in kitchen'")}; reset role;`, USERS.manager, async (db) => {
      const vos = await db.query<Row>(`select title, variation_no, variation_of, variation_approval, variation_requested_by from public.tasks where variation_no is not null order by variation_no`);
      expect(vos).toHaveLength(2);
      expect(vos[0]).toMatchObject({ variation_no: 1, variation_of: T, variation_approval: "pending", variation_requested_by: "Mr Borg (client)" });
      expect(String(vos[0].title)).toMatch(/^VO-001 · /);
      expect(vos[1].title).toBe("VO-002 · Extra socket in kitchen");
      const [g] = await db.query<Row>(`select g.name from public.tasks t join public.groups g on g.id = t.group_id where t.variation_no = 1`);
      expect(g.name).toBe("Variations");
      expect(await db.query("select 1 from public.groups where project_id = '" + PROJECTS.valletta + "' and name = 'Variations'")).toHaveLength(1);
      const [orig] = await db.query<Row>(`select variation_no from public.tasks where id = '${T}'`);
      expect(orig.variation_no).toBeNull();
    });
  });

  it("technicians can't create variations or change their details, but can work on the task", async () => {
    await asUser(USERS.tech1, async (db) => {
      expect(await db.fails(make())).toMatch(/Only managers/);
    });
    await withSetup(`${as(USERS.manager)} ${make()}; reset role;`, USERS.tech1, async (db) => {
      expect(await db.fails("update public.tasks set variation_approval = 'approved' where variation_no = 1")).toMatch(/Only managers/);
      await db.query("update public.tasks set progress = 50 where variation_no = 1");
      expect((await db.query<Row>("select progress from public.tasks where variation_no = 1"))[0].progress).toBe(50);
    });
    await withSetup(`${as(USERS.manager)} ${make()}; update public.tasks set variation_approval = 'approved' where variation_no = 1; reset role;`, USERS.manager, async (db) => {
      expect((await db.query<Row>("select variation_approval from public.tasks where variation_no = 1"))[0].variation_approval).toBe("approved");
    });
  });
});

// ---------------------------------------------------------------------------
describe("banner at the top of the app (administrators only)", () => {
  type Row = Record<string, unknown>;
  const seen = async (db: { query: <T = Row>(s: string) => Promise<T[]> }) =>
    (await db.query<{ body: string }>("select body from public.my_banner_messages()")).map((r) => r.body).sort();

  it("each person sees only live messages meant for them", async () => {
    const sql = `
      insert into public.banner_messages (body, created_by) values ('for everyone', '${USERS.admin}');
      insert into public.banner_messages (body, created_by, audience_type, audience_roles) values ('technicians', '${USERS.admin}', 'levels', '{technician}');
      insert into public.banner_messages (body, created_by, audience_type, audience_projects) values ('valletta team', '${USERS.admin}', 'projects', '{${PROJECTS.valletta}}');
      insert into public.banner_messages (body, created_by, audience_type, audience_people) values ('just tech2', '${USERS.admin}', 'people', '{${USERS.tech2}}');
      insert into public.banner_messages (body, created_by, paused) values ('paused', '${USERS.admin}', true);
      insert into public.banner_messages (body, created_by, starts_at) values ('later', '${USERS.admin}', now() + interval '1 day');
      insert into public.banner_messages (body, created_by, starts_at, ends_at) values ('over', '${USERS.admin}', now() - interval '2 days', now() - interval '1 day');`;
    await withSetup(sql, USERS.tech1, async (db) => {
      expect(await seen(db)).toEqual(["for everyone", "technicians", "valletta team"]);
      // Reading the table directly gives the same: nothing that isn't meant for them.
      expect(await count(db, "select 1 from public.banner_messages")).toBe(3);
    });
    await withSetup(sql, USERS.tech2, async (db) => expect(await seen(db)).toEqual(["for everyone", "just tech2", "technicians"]));
    await withSetup(sql, USERS.manager, async (db) => expect(await seen(db)).toEqual(["for everyone", "valletta team"])); // the manager is on Valletta
    await withSetup(sql, USERS.pending, async (db) => expect(await seen(db)).toEqual([]));
    await withSetup(sql, USERS.admin, async (db) => {
      // Administrators manage all of them, but their own banner only shows what's meant for them.
      expect(await count(db, "select 1 from public.banner_messages")).toBe(7);
      expect(await seen(db)).toEqual(["for everyone"]);
    });
  });

  it("only administrators add, change or remove messages — and it's in the audit log", async () => {
    const sql = `insert into public.banner_messages (id, body, created_by) values ('50000000-0000-4000-8000-0000000000b1', 'site closed Friday', '${USERS.admin}');`;
    for (const u of [USERS.manager, USERS.tech1]) {
      await withSetup(sql, u, async (db) => {
        expect(await db.fails(`insert into public.banner_messages (body, created_by) values ('x', '${u}')`)).toMatch(/row-level security/);
        await db.query("update public.banner_messages set body = 'hacked'");
        await db.query("delete from public.banner_messages");
        expect((await db.query<Row>("select body from public.my_banner_messages()")).map((r) => r.body)).toEqual(["site closed Friday"]);
      });
    }
    await asUser(USERS.admin, async (db) => {
      await db.query(`insert into public.banner_messages (body, tone, ends_at) values ('Toolbox talk', 'reminder', now() + interval '3 days')`);
      await db.query("update public.banner_messages set paused = true where body = 'Toolbox talk'");
      await db.query("delete from public.banner_messages where body = 'Toolbox talk'");
      const log = await db.query<Row>("select action from public.audit_log where entity = 'banner' and created_at = now() order by id");
      expect(log.map((r) => r.action)).toEqual(["created", "updated", "deleted"]);
      expect(await db.fails(`insert into public.banner_messages (body, starts_at, ends_at) values ('bad', now(), now() - interval '1 hour')`)).toMatch(/check/);
      expect(await db.fails(`insert into public.banner_messages (body, link) values ('bad link', 'javascript:alert(1)')`)).toMatch(/check/);
    });
  });
});

// ---------------------------------------------------------------------------
describe("modules: Aftersales (tickets)", () => {
  type Row = Record<string, unknown>;
  const grant = (u: string, level: "agent" | "manager") =>
    `insert into public.module_access (user_id, module, level, granted_by) values ('${u}', 'aftersales', '${level}', '${USERS.admin}');`;
  const as = (u: string) => `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', true);`;
  const T = "60000000-0000-4000-8000-0000000000a1";
  const C = "60000000-0000-4000-8000-0000000000c1";
  const ticket = `
    insert into public.as_customers (id, name, created_by) values ('${C}', 'Solair Owners Assoc.', '${USERS.admin}');
    insert into public.as_tickets (id, subject, customer_id, created_by) values ('${T}', 'Fire panel beeping', '${C}', '${USERS.admin}');`;

  it("people without the module see nothing and can't add anything — even managers", async () => {
    for (const u of [USERS.manager, USERS.tech1, USERS.basic]) {
      await withSetup(ticket, u, async (db) => {
        for (const t of ["as_tickets", "as_customers", "as_messages", "as_categories", "as_contacts", "as_sites", "as_files"]) {
          expect(await count(db, `select 1 from public.${t}`)).toBe(0);
        }
        expect(await db.fails(`insert into public.as_tickets (subject, created_by) values ('x', '${u}')`)).toMatch(/row-level security/);
        expect(await db.fails(`insert into public.as_customers (name) values ('x')`)).toMatch(/row-level security/);
        expect(await db.fails(`insert into storage.objects (bucket_id, name, owner_id) values ('aftersales', 'tickets/${T}/a.pdf', '${u}')`)).toMatch(/row-level security/);
      });
    }
  });

  it("only administrators give access; a pending account gets nothing even with access", async () => {
    await asUser(USERS.manager, async (db) => {
      expect(await db.fails(grant(USERS.manager, "manager"))).toMatch(/row-level security/);
    });
    await withSetup(`${grant(USERS.pending, "manager")} ${ticket}`, USERS.pending, async (db) => {
      expect(await count(db, "select 1 from public.as_tickets")).toBe(0);
    });
    await asUser(USERS.admin, async (db) => {
      await db.query(grant(USERS.tech1, "agent"));
      expect(await count(db, `select 1 from public.module_access where user_id = '${USERS.tech1}'`)).toBe(1);
    });
  });

  it("a new ticket gets an OGT number, a history line, and the managers are told", async () => {
    await withSetup(`${grant(USERS.manager, "manager")} ${grant(USERS.tech1, "agent")}`, USERS.tech1, async (db) => {
      const [t] = await db.query<Row>(`insert into public.as_tickets (subject, priority, created_by) values ('CCTV camera 3 offline', 'high', '${USERS.tech1}') returning id, number, status`);
      expect(Number(t.number)).toBeGreaterThanOrEqual(1001);
      expect(t.status).toBe("new");
      expect((await db.query<Row>(`select body from public.as_messages where ticket_id = '${t.id}'`)).map((r) => r.body)).toEqual(["Ticket opened"]);
    });
    await withSetup(
      `${grant(USERS.manager, "manager")} ${grant(USERS.tech1, "agent")} ${as(USERS.tech1)} insert into public.as_tickets (subject, created_by) values ('Intercom dead', '${USERS.tech1}'); reset role;`,
      USERS.manager,
      async (db) => {
        expect((await db.query<Row>("select title from public.notifications where type = 'ticket.new'")).map((r) => r.title)[0]).toMatch(/^New ticket OGT-\d+$/);
      },
    );
  });

  it("assigning, replying and the customer writing back move the status along", async () => {
    const setup = `${grant(USERS.tech1, "agent")} ${ticket}`;
    await withSetup(setup, USERS.admin, async (db) => {
      const status = async () => (await db.query<Row>(`select status, first_response_at from public.as_tickets where id = '${T}'`))[0];
      await db.query(`update public.as_tickets set assigned_to = '${USERS.tech1}' where id = '${T}'`);
      expect((await status()).status).toBe("assigned");
      await db.query(`insert into public.as_messages (ticket_id, kind, author_id, body) values ('${T}', 'reply', '${USERS.admin}', 'We will visit tomorrow')`);
      const s = await status();
      expect(s.status).toBe("in_progress");
      expect(s.first_response_at).not.toBeNull();
      await db.query(`update public.as_tickets set status = 'resolved' where id = '${T}'`);
      expect((await db.query<Row>(`select resolved_at from public.as_tickets where id = '${T}'`))[0].resolved_at).not.toBeNull();
      await db.query(`insert into public.as_messages (ticket_id, kind, author_id, from_name, body) values ('${T}', 'customer', '${USERS.admin}', 'Mr Borg', 'Still beeping')`);
      expect((await status()).status).toBe("in_progress");
      const history = (await db.query<Row>(`select body from public.as_messages where ticket_id = '${T}' and kind = 'event' order by created_at, body`)).map((r) => r.body);
      expect(history.some((h) => /^Assigned to \S/.test(String(h)))).toBe(true);
      expect(history.some((h) => String(h).startsWith("Status: In progress → Resolved"))).toBe(true);
      expect(await count(db, "select 1 from public.audit_log where entity = 'ticket' and created_at = now()")).toBeGreaterThanOrEqual(2);
    });
    await withSetup(`${setup} update public.as_tickets set assigned_to = '${USERS.tech1}' where id = '${T}';`, USERS.tech1, async (db) => {
      expect((await db.query<Row>("select title from public.notifications where type = 'ticket.assigned'")).length).toBe(1);
    });
  });

  it("ticket numbers read OGT-… in notifications and the audit log", async () => {
    await withSetup(`${grant(USERS.tech1, "agent")} ${ticket} update public.as_tickets set assigned_to = '${USERS.tech1}' where id = '${T}';`, USERS.tech1, async (db) => {
      expect((await db.query<Row>("select title from public.notifications where type = 'ticket.assigned'"))[0].title).toMatch(/^OGT-\d+ was given to you$/);
    });
    await withSetup(ticket, USERS.admin, async (db) => {
      expect((await db.query<Row>(`select title from public.audit_log where entity = 'ticket' and entity_id = '${T}'`))[0].title).toMatch(/^OGT-\d+ · Fire panel beeping$/);
    });
  });

  it("tickets only go to people with the module; members are listed only to members", async () => {
    await withSetup(`${grant(USERS.tech1, "agent")} ${ticket}`, USERS.admin, async (db) => {
      expect(await db.fails(`update public.as_tickets set assigned_to = '${USERS.tech2}' where id = '${T}'`)).toMatch(/can't use Aftersales/);
      const names = (await db.query<Row>("select user_id, level from public.module_members('aftersales')")).map((r) => `${r.user_id}:${r.level}`);
      expect(names).toEqual(expect.arrayContaining([`${USERS.admin}:manager`, `${USERS.tech1}:agent`]));
      expect(names).toHaveLength(2);
    });
    await asUser(USERS.tech2, async (db) => expect(await count(db, "select * from public.module_members('aftersales')")).toBe(0));
  });

  it("agents work on tickets but can't delete them, change categories, or fake history", async () => {
    await withSetup(`${grant(USERS.tech1, "agent")} ${ticket}`, USERS.tech1, async (db) => {
      expect(await count(db, "select 1 from public.as_categories")).toBe(10);
      await db.query(`insert into public.as_messages (ticket_id, kind, author_id, body) values ('${T}', 'note', '${USERS.tech1}', 'Panel needs new battery')`);
      expect(await db.fails(`insert into public.as_messages (ticket_id, kind, author_id, body) values ('${T}', 'event', '${USERS.tech1}', 'Ticket closed')`)).toMatch(/row-level security/);
      expect(await db.fails(`insert into public.as_messages (ticket_id, kind, author_id, body) values ('${T}', 'note', '${USERS.admin}', 'as someone else')`)).toMatch(/row-level security/);
      expect(await db.fails("update public.as_messages set body = 'edited'")).toMatch(/permission denied/);
      expect(await db.fails("insert into public.as_categories (name) values ('Lifts')")).toMatch(/row-level security/);
      await db.query(`delete from public.as_tickets where id = '${T}'`);
      expect(await count(db, "select 1 from public.as_tickets")).toBe(1);
      expect(await db.fails(`insert into storage.objects (bucket_id, name, owner_id) values ('aftersales', 'tickets/${T}/a.pdf', '${USERS.tech1}')`)).toBeNull();
      expect(await db.fails(`insert into public.as_files (id, ticket_id, storage_path, file_name, uploaded_by) values (gen_random_uuid(), '${T}', 'elsewhere/a.pdf', 'a.pdf', '${USERS.tech1}')`)).toMatch(/row-level security/);
    });
    await withSetup(`${grant(USERS.manager, "manager")} ${ticket}`, USERS.manager, async (db) => {
      await db.query("insert into public.as_categories (name, position) values ('Lifts', 11)");
      await db.query(`delete from public.as_tickets where id = '${T}'`);
      expect(await count(db, "select 1 from public.as_tickets")).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
describe("Aftersales email (Gmail)", () => {
  type Row = Record<string, unknown>;
  const grant = (u: string, level: "agent" | "manager") =>
    `insert into public.module_access (user_id, module, level, granted_by) values ('${u}', 'aftersales', '${level}', '${USERS.admin}');`;
  const connected = `update public.as_mail_settings set mailbox = 'support@oriongroup.com.mt', refresh_token = 'secret-refresh', access_token = 'secret-access', connected_at = now();`;

  it("the mailbox keys are never readable — not even by administrators", async () => {
    await withSetup(connected, USERS.admin, async (db) => {
      expect(await db.fails("select refresh_token from public.as_mail_settings")).toMatch(/permission denied/);
      const status = (await db.query<Row>("select public.aftersales_mail_status() as s"))[0].s as Record<string, unknown>;
      expect(status).toMatchObject({ mailbox: "support@oriongroup.com.mt", connected: true, auto_ack: true });
      expect(JSON.stringify(status)).not.toMatch(/secret-/);
    });
    await withSetup(connected, USERS.manager, async (db) => {
      expect((await db.query<Row>("select public.aftersales_mail_status() as s"))[0].s).toBeNull();
    });
  });

  it("only Aftersales managers change the automatic reply, and it must show the ticket number", async () => {
    await withSetup(grant(USERS.tech1, "agent"), USERS.tech1, async (db) => {
      expect(await db.fails("select public.set_aftersales_mail_options(false, 'Hi {ticket}', 'Orion')")).toMatch(/Only Aftersales managers/);
    });
    await withSetup(grant(USERS.manager, "manager"), USERS.manager, async (db) => {
      expect(await db.fails("select public.set_aftersales_mail_options(true, 'Thanks, we got it', 'Orion')")).toMatch(/must include \{ticket\}/);
      await db.query("select public.set_aftersales_mail_options(true, 'Logged as {ticket}', 'Orion Aftersales')");
      expect((await db.query<Row>("select public.aftersales_mail_status() as s"))[0].s).toMatchObject({ ack_text: "Logged as {ticket}", signature: "Orion Aftersales" });
    });
  });

  it("people can't fake email details on messages", async () => {
    const T = "60000000-0000-4000-8000-0000000000e1";
    await withSetup(`${grant(USERS.tech1, "agent")} insert into public.as_tickets (id, subject, created_by) values ('${T}', 'x', '${USERS.admin}');`, USERS.tech1, async (db) => {
      expect(await db.fails(`insert into public.as_messages (ticket_id, kind, author_id, body, gmail_id) values ('${T}', 'reply', '${USERS.tech1}', 'hi', 'g1')`)).toMatch(/row-level security/);
      expect(await db.fails(`insert into public.as_messages (ticket_id, kind, author_id, body, email_message_id) values ('${T}', 'reply', '${USERS.tech1}', 'hi', '<x@y>')`)).toMatch(/row-level security/);
      expect(await db.fails(`insert into public.as_messages (ticket_id, kind, author_id, body) values ('${T}', 'reply', '${USERS.tech1}', 'hi')`)).toBeNull();
    });
  });
});
