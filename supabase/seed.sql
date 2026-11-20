-- =====================================================================
-- Orion Projects — DEMO SEED DATA (local development & testing ONLY)
-- Never run this on the production database.
--
-- Demo logins (all use the password:  OrionDemo!2026 )
--   admin@orion.test      Administrator
--   manager@orion.test    Manager
--   tech1@orion.test      Technician (Valletta project)
--   tech2@orion.test      Technician (Mosta project)
--   basic@orion.test      Basic (Valletta project, read-only)
--   pending@orion.test    Waiting for approval
-- =====================================================================

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@orion.test',   'Ada',   'Azzopardi'),
      ('00000000-0000-4000-8000-000000000002'::uuid, 'manager@orion.test', 'Mark',  'Borg'),
      ('00000000-0000-4000-8000-000000000003'::uuid, 'tech1@orion.test',   'Tina',  'Camilleri'),
      ('00000000-0000-4000-8000-000000000004'::uuid, 'tech2@orion.test',   'Tom',   'Debono'),
      ('00000000-0000-4000-8000-000000000005'::uuid, 'basic@orion.test',   'Ben',   'Ellul'),
      ('00000000-0000-4000-8000-000000000006'::uuid, 'pending@orion.test', 'Paula', 'Farrugia')
    ) as t(id, email, first_name, last_name)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            extensions.crypt('OrionDemo!2026', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
            jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;
end $$;

-- Levels and approval (seed runs as the database owner, so the guard trigger allows it).
update public.profiles set role = 'admin',      status = 'active' where email = 'admin@orion.test';
update public.profiles set role = 'manager',    status = 'active' where email = 'manager@orion.test';
update public.profiles set role = 'technician', status = 'active' where email in ('tech1@orion.test', 'tech2@orion.test');
update public.profiles set role = 'basic',      status = 'active' where email = 'basic@orion.test';
-- pending@orion.test stays 'pending'.
-- Demo accounts were "approved" a month ago (so the demo chat messages count as unread).
update public.profiles set approved_at = now() - interval '30 days', created_at = now() - interval '31 days'
where email <> 'pending@orion.test';

-- ---------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------
insert into public.clients (id, name, contact_name, contact_email, contact_phone, created_by) values
  ('10000000-0000-4000-8000-000000000001', 'Harbour Holdings Ltd', 'Claire Vella', 'claire@harbour.example', '+356 2100 0001', '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000002', 'Sunrise Energy',       'Joseph Grech', 'joseph@sunrise.example', '+356 2100 0002', '00000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------
-- Projects (trigger adds default status labels + project chat channel)
-- ---------------------------------------------------------------------
insert into public.projects (id, name, code, description, client_id, start_date, end_date, color, created_by) values
  ('20000000-0000-4000-8000-000000000001', 'Valletta Office Fit-out', 'VAL-001',
   'Full fit-out of the 3rd floor office: partitions, electrical, data cabling and finishes.',
   '10000000-0000-4000-8000-000000000001', current_date - 21, current_date + 40, '#2563eb', '00000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002', 'Mosta Solar Installation', 'MOS-002',
   '45 kWp rooftop PV system with inverter room and grid connection.',
   '10000000-0000-4000-8000-000000000002', current_date - 7, current_date + 30, '#ea580c', '00000000-0000-4000-8000-000000000002');

insert into public.project_members (project_id, user_id, added_by) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002');

-- Groups (phases)
insert into public.groups (id, project_id, name, color, position) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Planning',    '#6366f1', 1),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'In progress', '#f59e0b', 2),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Done',        '#22c55e', 3),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'Planning',    '#6366f1', 1),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'Installation','#f59e0b', 2),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', 'Commissioning','#22c55e', 3);

-- Tasks (status looked up by name from each project's default labels)
insert into public.tasks (id, project_id, group_id, title, status_id, priority, start_date, due_date, progress, position, created_by)
select t.id::uuid, t.project_id::uuid, t.group_id::uuid, t.title,
       (select s.id from public.status_labels s where s.project_id = t.project_id::uuid and s.name = t.status),
       t.priority::public.task_priority, current_date + t.s, current_date + t.d, t.progress, t.pos,
       '00000000-0000-4000-8000-000000000002'
from (values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Site survey & measurements', 'Done',          'medium',  -21, -18, 100, 1),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Layout approval with client', 'Done',         'high',    -17, -12, 100, 2),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Partition walls',            'Working on it', 'high',    -10,   3,  60, 1),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Electrical first fix',       'Stuck',         'critical', -5,   2,  20, 2),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Data cabling',               'Not started',   'medium',    3,  14,   0, 3),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'Painting & finishes',        'Not started',   'low',      15,  35,   0, 1),
  ('40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'Structural roof check',      'Done',          'high',     -7,  -4, 100, 1),
  ('40000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Mounting rails',             'Working on it', 'medium',   -3,   4,  40, 1),
  ('40000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Panel installation',         'Not started',   'medium',    5,  15,   0, 2),
  ('40000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'Grid connection & testing',  'Not started',   'high',     16,  28,   0, 1)
) as t(id, project_id, group_id, title, status, priority, s, d, progress, pos);

insert into public.task_assignees (task_id, user_id, assigned_by) values
  ('40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002');

insert into public.task_dependencies (task_id, depends_on_task_id) values
  ('40000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000003'),
  ('40000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000008'),
  ('40000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-000000000009');

insert into public.task_checklist_items (task_id, title, is_done, position) values
  ('40000000-0000-4000-8000-000000000004', 'Order cable trays', true, 1),
  ('40000000-0000-4000-8000-000000000004', 'Confirm DB board location', false, 2),
  ('40000000-0000-4000-8000-000000000004', 'Chase permit from landlord', false, 3);

insert into public.milestones (project_id, title, date, created_by) values
  ('20000000-0000-4000-8000-000000000001', 'Client walkthrough', current_date + 10, '00000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000001', 'Handover',           current_date + 40, '00000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002', 'Grid energisation',  current_date + 28, '00000000-0000-4000-8000-000000000002');

insert into public.comments (task_id, author_id, body) values
  ('40000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'Waiting on landlord permit before chasing walls.'),
  ('40000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'I''ll call them this afternoon.');

insert into public.daily_updates (project_id, author_id, work_date, work_done, hours, issues) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', current_date - 1,
   'Finished stud framing on the east side. Started boarding meeting room 2.', 8, null),
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', current_date,
   'Boarding meeting room 2 complete. Electrical containment marked out.', 7.5, 'Permit for wall chasing still pending.'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', current_date,
   'Mounting rails installed on south roof (rows 1–4).', 8, null);

insert into public.messages (channel_id, author_id, body)
select c.id, '00000000-0000-4000-8000-000000000002', 'Welcome to the project chat! Post questions and photos here.'
from public.channels c where c.type = 'project';

insert into public.messages (channel_id, author_id, body)
select c.id, '00000000-0000-4000-8000-000000000001', 'Welcome to Orion Projects 👋 Announcements will appear here.'
from public.channels c where c.type = 'general';

-- Loading demo data fires the notification triggers; start with a clean inbox.
do $$ begin
  if to_regclass('public.notifications') is not null then delete from public.notifications; end if;
end $$;
