-- =====================================================================
-- Orion Projects — import: Solair (OG5376) M&E programme of works
--
-- Made from "OG5376 - Solair POW - OG 17112026.pdf". Run ONCE in Supabase →
-- SQL Editor (after all database updates up to 0020). It creates the project
-- with 9 groups, 44 tasks (progress as in the programme), the 6 M&E steps as a
-- checklist on every unit, the "waiting for" links from the programme's arrows,
-- and 10 milestones. The first administrator is set as the creator, so the
-- project is on their list; add the team in Settings → People afterwards.
-- Running it again does nothing (it checks for project code OG5376).
-- This is not a database update: it isn't part of supabase/migrations.
-- =====================================================================
do $$
declare
  v_creator uuid;
  v_project uuid;
  v_not_started uuid;
  v_working uuid;
  v_done uuid;
  r record;
  v_task uuid;
  v_prev uuid;
begin
  if exists (select 1 from public.projects where code = 'OG5376' and not is_template) then
    raise notice 'Project OG5376 already exists — nothing was changed.';
    return;
  end if;
  select id into v_creator from public.profiles where role = 'admin' and status = 'active' order by created_at limit 1;
  if v_creator is null then
    raise exception 'No active administrator found to own the project.';
  end if;

  insert into public.projects (name, code, description, status, start_date, end_date, color, created_by)
  values ('Solair', 'OG5376',
          'M&E works (electrical and plumbing) for Solair. Project lead: Orion Group Ltd. Imported from the programme of works dated 17/11/2026.',
          'active', date '2026-07-22', date '2027-03-26', '#2d57a3', v_creator)
  returning id into v_project;

  -- Status labels come from the project's defaults.
  select id into v_not_started from public.status_labels where project_id = v_project and not is_done order by position limit 1;
  select id into v_working from public.status_labels where project_id = v_project and name = 'Working on it' limit 1;
  v_working := coalesce(v_working, v_not_started);
  select id into v_done from public.status_labels where project_id = v_project and is_done order by position limit 1;

  create temporary table imp_groups (n int, name text, color text, id uuid) on commit drop;
  insert into imp_groups (n, name, color) values
    (1, 'Floor 1', '#6366f1'),
    (2, 'Floor 2', '#0ea5e9'),
    (3, 'Floor 3', '#14b8a6'),
    (4, 'Floor 4', '#22c55e'),
    (5, 'Floor 5', '#84cc16'),
    (6, 'Floor 6', '#eab308'),
    (7, 'Penthouses', '#f97316'),
    (8, 'Ground Floor - Maisonettes', '#ec4899'),
    (9, 'Common Areas', '#64748b');
  update imp_groups set id = gen_random_uuid();
  insert into public.groups (id, project_id, name, color, position)
  select id, v_project, name, color, n from imp_groups;

  create temporary table imp_tasks (g int, n int, title text, s date, f date, progress int, unit boolean) on commit drop;
  insert into imp_tasks (g, n, title, s, f, progress, unit) values
    (1, 1, 'Apartment 1 - Block A', date '2026-07-22', date '2026-07-30', 90, true),
    (1, 2, 'Apartment 2 - Block A', date '2026-07-29', date '2026-08-06', 90, true),
    (1, 3, 'Apartment 3 - Block A', date '2026-08-05', date '2026-08-13', 90, true),
    (1, 4, 'Apartment 1 - Block B', date '2026-08-12', date '2026-08-21', 80, true),
    (1, 5, 'Apartment 2 - Block B', date '2026-08-20', date '2026-08-28', 80, true),
    (1, 6, 'Apartment 3 - Block B', date '2026-08-27', date '2026-09-04', 80, true),
    (2, 1, 'Apartment 4 - Block A', date '2026-09-03', date '2026-09-11', 80, true),
    (2, 2, 'Apartment 5 - Block A', date '2026-09-10', date '2026-09-18', 80, true),
    (2, 3, 'Apartment 6 - Block A', date '2026-09-17', date '2026-09-25', 80, true),
    (2, 4, 'Apartment 4 - Block B', date '2026-09-24', date '2026-10-05', 80, true),
    (2, 5, 'Apartment 5 - Block B', date '2026-10-02', date '2026-10-12', 80, true),
    (2, 6, 'Apartment 6 - Block B', date '2026-10-09', date '2026-10-19', 80, true),
    (3, 1, 'Apartment 7 - Block A', date '2026-10-16', date '2026-10-26', 80, true),
    (3, 2, 'Apartment 8 - Block A', date '2026-10-23', date '2026-11-02', 80, true),
    (3, 3, 'Apartment 9 - Block A', date '2026-10-30', date '2026-11-09', 80, true),
    (3, 4, 'Apartment 7 - Block B', date '2026-11-06', date '2026-11-17', 70, true),
    (3, 5, 'Apartment 8 - Block B', date '2026-11-17', date '2026-11-20', 35, true),
    (3, 6, 'Apartment 9 - Block B', date '2026-11-20', date '2026-11-25', 35, true),
    (4, 1, 'Apartment 10 - Block A', date '2026-11-25', date '2026-11-30', 0, true),
    (4, 2, 'Apartment 11 - Block A', date '2026-11-30', date '2026-12-03', 0, true),
    (4, 3, 'Apartment 12 - Block A', date '2026-12-03', date '2026-12-08', 0, true),
    (4, 4, 'Apartment 10 - Block B', date '2026-12-08', date '2026-12-14', 0, true),
    (4, 5, 'Apartment 11 - Block B', date '2026-12-14', date '2026-12-17', 0, true),
    (4, 6, 'Apartment 12 - Block B', date '2026-12-17', date '2026-12-22', 0, true),
    (5, 1, 'Apartment 13 - Block A', date '2027-01-04', date '2027-01-07', 0, true),
    (5, 2, 'Apartment 14 - Block A', date '2027-01-07', date '2027-01-12', 0, true),
    (5, 3, 'Apartment 15 - Block A', date '2027-01-12', date '2027-01-15', 0, true),
    (5, 4, 'Apartment 13 - Block B', date '2027-01-15', date '2027-01-20', 0, true),
    (5, 5, 'Apartment 14 - Block B', date '2027-01-20', date '2027-01-25', 0, true),
    (5, 6, 'Apartment 15 - Block B', date '2027-01-25', date '2027-01-28', 0, true),
    (6, 1, 'Apartment 16 - Block A', date '2027-01-28', date '2027-02-02', 0, true),
    (6, 2, 'Apartment 17 - Block A', date '2027-02-02', date '2027-02-05', 0, true),
    (6, 3, 'Apartment 18 - Block A', date '2027-02-05', date '2027-02-10', 0, true),
    (6, 4, 'Apartment 16 - Block B', date '2027-02-10', date '2027-02-16', 0, true),
    (6, 5, 'Apartment 17 - Block B', date '2027-02-16', date '2027-02-19', 0, true),
    (6, 6, 'Apartment 18 - Block B', date '2027-02-19', date '2027-02-24', 0, true),
    (7, 1, 'Penthouse 19 - Block A', date '2027-02-25', date '2027-03-03', 0, true),
    (7, 2, 'Penthouse 19 - Block B', date '2027-03-04', date '2027-03-10', 0, true),
    (8, 1, 'Maisonette 1', date '2027-03-11', date '2027-03-16', 0, true),
    (8, 2, 'Maisonette 2', date '2027-03-17', date '2027-03-22', 0, true),
    (8, 3, 'Maisonette 3', date '2027-03-23', date '2027-03-26', 0, true),
    (9, 1, 'Internal Shafts', date '2026-09-14', date '2027-03-03', 10, false),
    (9, 2, 'Roofs', date '2027-03-04', date '2027-03-26', 0, false),
    (9, 3, 'Garages @Level -1 and Level -2', date '2026-08-27', date '2027-03-03', 10, false);

  -- Tasks in programme order; units are linked one after another (as the programme's arrows).
  for r in select t.*, ig.id as group_id, ig.name as group_name from imp_tasks t join imp_groups ig on ig.n = t.g order by t.g, t.n loop
    insert into public.tasks (project_id, group_id, title, status_id, priority, start_date, due_date, progress, position, created_by)
    values (v_project, r.group_id, r.title,
            case when r.progress >= 100 then v_done when r.progress > 0 then v_working else v_not_started end,
            'medium', r.s, r.f, least(r.progress, 100), r.n, v_creator)
    returning id into v_task;

    if r.unit then
      insert into public.task_checklist_items (task_id, title, is_done, position)
      select v_task, s.title, false, s.ord from unnest(array['Electrical work chasing', 'Electrical work first fix', 'Electrical work second fix', 'Kitchen plumbing works', 'Bathroom/s plumbing', 'Sanitary ware installation']) with ordinality as s(title, ord);
      if v_prev is not null then
        insert into public.task_dependencies (task_id, depends_on_task_id) values (v_task, v_prev);
      end if;
      v_prev := v_task;
    end if;
  end loop;

  -- Common areas: Roofs follow the internal shafts.
  insert into public.task_dependencies (task_id, depends_on_task_id)
  select roofs.id, shafts.id
  from public.tasks roofs, public.tasks shafts
  where roofs.project_id = v_project and roofs.title = 'Roofs'
    and shafts.project_id = v_project and shafts.title = 'Internal Shafts';

  insert into public.milestones (project_id, title, date, color, created_by)
  select v_project, m.title, m.d, m.c, v_creator from (values
    ('Floor 1 complete', date '2026-09-04', '#0584c7'),
    ('Floor 2 complete', date '2026-10-19', '#0584c7'),
    ('Floor 3 complete', date '2026-11-25', '#0584c7'),
    ('Floor 4 complete', date '2026-12-22', '#0584c7'),
    ('Floor 5 complete', date '2027-01-28', '#0584c7'),
    ('Floor 6 complete', date '2027-02-24', '#0584c7'),
    ('Penthouses complete', date '2027-03-10', '#0584c7'),
    ('Maisonettes complete', date '2027-03-26', '#0584c7'),
    ('Common areas complete', date '2027-03-26', '#0584c7'),
    ('Practical completion – M&E', date '2027-03-26', '#7c3aed')
  ) as m(title, d, c);

  raise notice 'Created project Solair (OG5376): % tasks.', (select count(*) from public.tasks where project_id = v_project);
end
$$;
