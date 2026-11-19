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
        expect(await count(db, `select 1 from public.${t}`)).toBe(0);
      }
      expect(await db.fails("insert into public.projects (name) values ('x')")).toMatch(/row-level security/);
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
