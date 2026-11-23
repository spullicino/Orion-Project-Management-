-- =====================================================================
-- Orion Projects — 0021 Product catalogue for material requests
--
-- Managers keep a list of products (name, unit, category, code). Workers pick
-- from it when requesting materials (they can still type a one-off item).
-- Request items are linked to products, so a project's materials report can
-- add up exactly what was delivered.
-- =====================================================================

create table public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 200),
  unit       text not null default 'pcs' check (char_length(unit) between 1 and 20),
  category   text check (char_length(category) <= 60),
  code       text check (char_length(code) <= 60),
  active     boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- The same product name can't be listed twice with the same unit.
create unique index products_name_unit_idx on public.products (lower(trim(name)), unit);
create index products_category_idx on public.products (category, name) where active;
create trigger products_touch before update on public.products
  for each row execute function app.touch_updated_at();

alter table public.products enable row level security;
create policy "products: everyone signed in reads" on public.products
  for select to authenticated using (app.is_active());
create policy "products: managers add" on public.products
  for insert to authenticated with check (app.is_manager_or_above());
create policy "products: managers edit" on public.products
  for update to authenticated using (app.is_manager_or_above()) with check (app.is_manager_or_above());
create policy "products: admins delete" on public.products
  for delete to authenticated using (app.is_admin());
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;

-- Request items can point at a product.
alter table public.material_request_items
  add column product_id uuid references public.products (id) on delete set null;
create index material_items_product_idx on public.material_request_items (product_id) where product_id is not null;

-- A typed item whose name and unit exactly match a product is linked to it automatically.
create or replace function app.material_item_link_product()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.product_id is null then
    select p.id into new.product_id from public.products p
    where p.active and lower(trim(p.name)) = lower(trim(new.name)) and p.unit = new.unit
    limit 1;
  end if;
  return new;
end;
$$;
create trigger material_items_link_product before insert or update of name, unit, product_id on public.material_request_items
  for each row execute function app.material_item_link_product();

-- Adding (or renaming) a product links earlier items that were typed with the same name and unit.
create or replace function app.product_link_items()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.active then
    update public.material_request_items i set product_id = new.id
    where i.product_id is null and lower(trim(i.name)) = lower(trim(new.name)) and i.unit = new.unit;
  end if;
  return null;
end;
$$;
create trigger products_link_items after insert or update of name, unit, active on public.products
  for each row execute function app.product_link_items();

-- Creating a request now also records the chosen products.
create or replace function public.create_material_request(
  p_id uuid, p_project uuid, p_needed_by date, p_urgent boolean, p_note text, p_items jsonb, p_copied_from uuid default null
)
returns jsonb
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  existing public.material_requests%rowtype;
  r public.material_requests%rowtype;
begin
  select * into existing from public.material_requests where id = p_id;
  if found then
    if existing.requested_by <> auth.uid() then
      raise exception 'This request could not be saved. Please try again.';
    end if;
    return jsonb_build_object('id', existing.id, 'number', existing.number, 'project_id', existing.project_id);
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'A request can have up to 100 items';
  end if;

  insert into public.material_requests (id, project_id, requested_by, needed_by, urgent, delivery_note, copied_from)
  values (p_id, p_project, auth.uid(), p_needed_by, coalesce(p_urgent, false), nullif(trim(p_note), ''), p_copied_from)
  returning * into r;

  insert into public.material_request_items (request_id, position, name, quantity, unit, note, product_id)
  select r.id, x.ord::integer, trim(x.v->>'name'), (x.v->>'quantity')::numeric, coalesce(nullif(trim(x.v->>'unit'), ''), 'pcs'), nullif(trim(x.v->>'note'), ''),
         -- Chosen from the product list (ignored if that product no longer exists).
         (select p.id from public.products p where p.id::text = nullif(x.v->>'product_id', ''))
  from jsonb_array_elements(p_items) with ordinality as x(v, ord);

  return jsonb_build_object('id', r.id, 'number', r.number, 'project_id', r.project_id);
end;
$$;

-- Materials report for a project: what was delivered (optionally between two dates), per product.
-- Items typed by hand (not in the catalogue) are listed by their name and unit.
create or replace function public.get_material_report(p_project uuid, p_from date default null, p_to date default null)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with lines as (
    select i.*, r.number,
           p.name as product_name, p.category, p.code,
           (coalesce(r.delivered_at,
                     (select max(e.created_at) from public.material_request_events e
                      where e.request_id = r.id and e.kind in ('delivered', 'partly_delivered')),
                     r.updated_at) at time zone 'Europe/Malta')::date as delivered_on
    from public.material_request_items i
    join public.material_requests r on r.id = i.request_id
    left join public.products p on p.id = i.product_id
    where r.project_id = p_project and r.status not in ('rejected', 'cancelled') and i.delivered_qty > 0
  )
  select coalesce(jsonb_agg(x order by x->>'category' nulls last, x->>'name'), '[]')
  from (
    select jsonb_build_object(
      'product_id', min(product_id::text),
      'name', coalesce(min(product_name), min(name)),
      'unit', min(unit),
      'category', min(category),
      'code', min(code),
      'in_catalogue', bool_or(product_id is not null),
      'delivered', sum(delivered_qty),
      'requested', sum(quantity),
      'requests', jsonb_agg(distinct number),
      'first_delivered', min(delivered_on),
      'last_delivered', max(delivered_on)
    ) as x
    from lines
    where (p_from is null or delivered_on >= p_from) and (p_to is null or delivered_on <= p_to)
    group by coalesce(product_id::text, 'typed:' || lower(trim(name)) || '|' || unit)
  ) s
$$;
revoke all on function public.get_material_report(uuid, date, date) from public, anon;
grant execute on function public.get_material_report(uuid, date, date) to authenticated;
grant execute on all functions in schema app to authenticated, service_role;
