-- OAC platform: colleges, canteens and canteen-scoped access.
-- Every college has its own canteens; each canteen has its own menu, slots, staff and orders.
-- Today's single-canteen data is backfilled into one college (ait-pune) and one canteen (oac).
-- profiles.role keeps student | staff | admin: `admin` is the admin of profiles.college_id, and
-- the rank inside a canteen (staff | owner) lives in canteen_members.role.
-- app_settings stays until the sign-up guard moves to college_domains (later migration).

-- ---------------------------------------------------------------------------
-- Types. canteen_role is declared low to high so `role >= 'staff'` compares by rank.
-- ---------------------------------------------------------------------------
create type public.canteen_status as enum ('pending', 'approved', 'suspended');
create type public.canteen_role as enum ('staff', 'owner');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

-- A sign-up email's domain picks the college. Domains are public (the login form reads them).
create table public.college_domains (
  domain text primary key check (domain = lower(domain) and domain !~ '[@[:space:]]'),
  college_id uuid not null references public.colleges (id) on delete cascade
);

create table public.canteens (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges (id),
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  code_prefix text not null check (code_prefix ~ '^[A-Z0-9]{2,5}$'),
  status public.canteen_status not null default 'pending',
  description text,
  order_cutoff_minutes int not null default 5 check (order_cutoff_minutes >= 0),
  no_show_hold_minutes int not null default 15 check (no_show_hold_minutes >= 0),
  created_at timestamptz not null default now(),
  unique (college_id, slug),
  unique (college_id, code_prefix)
);

create table public.canteen_members (
  user_id uuid references public.profiles (id) on delete cascade,
  canteen_id uuid references public.canteens (id) on delete cascade,
  role public.canteen_role not null default 'staff',
  primary key (user_id, canteen_id)
);

-- ---------------------------------------------------------------------------
-- Backfill rows: today's deployment becomes college ait-pune with canteen oac.
-- ---------------------------------------------------------------------------
insert into public.colleges (name, slug)
values ('Army Institute of Technology, Pune', 'ait-pune');

insert into public.canteens (college_id, name, slug, code_prefix, status, order_cutoff_minutes, no_show_hold_minutes)
select c.id, 'Open Area Canteen', 'oac', 'OAC', 'approved', s.order_cutoff_minutes, s.no_show_hold_minutes
from public.colleges c
cross join public.app_settings s
where c.slug = 'ait-pune';

insert into public.college_domains (domain, college_id)
select s.college_email_domain, c.id
from public.app_settings s
cross join public.colleges c
where c.slug = 'ait-pune' and s.college_email_domain is not null;

-- ---------------------------------------------------------------------------
-- Tenancy columns: add nullable, backfill, then require.
-- ---------------------------------------------------------------------------
alter table public.profiles add column college_id uuid references public.colleges (id);
alter table public.menu_items add column canteen_id uuid references public.canteens (id);
alter table public.slots add column canteen_id uuid references public.canteens (id);
alter table public.orders add column canteen_id uuid references public.canteens (id);

update public.profiles set college_id = (select c.id from public.colleges c where c.slug = 'ait-pune');
update public.menu_items set canteen_id = (select k.id from public.canteens k where k.slug = 'oac');
update public.slots set canteen_id = (select k.id from public.canteens k where k.slug = 'oac');
update public.orders set canteen_id = (select k.id from public.canteens k where k.slug = 'oac');

alter table public.profiles alter column college_id set not null;
alter table public.menu_items alter column canteen_id set not null;
alter table public.slots alter column canteen_id set not null;
alter table public.orders alter column canteen_id set not null;

-- ---------------------------------------------------------------------------
-- Constraints and indexes. Two canteens may open a slot at the same minute.
-- ---------------------------------------------------------------------------
alter table public.slots drop constraint slots_starts_at_key;
alter table public.slots add constraint slots_canteen_id_starts_at_key unique (canteen_id, starts_at);

create index canteen_members_canteen_id_idx on public.canteen_members (canteen_id);
create index menu_items_canteen_id_sort_idx on public.menu_items (canteen_id, sort);
create index orders_canteen_id_status_idx on public.orders (canteen_id, status);
create index order_items_menu_item_id_idx on public.order_items (menu_item_id);

-- ---------------------------------------------------------------------------
-- Access helpers. Both return nothing useful when signed out, without a profile,
-- or deactivated.
-- ---------------------------------------------------------------------------

-- The caller's college, or NULL.
create function public.current_college_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.college_id from public.profiles p where p.id = (select auth.uid()) and p.is_active
$$;

-- True when the caller works at the canteen with at least p_min_role, or is the admin of the
-- canteen's college. Never true for students, even with a stray membership row.
create function public.has_canteen_role(p_canteen_id uuid, p_min_role public.canteen_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('staff', 'admin')
      and (
        exists (
          select 1 from public.canteen_members m
          where m.user_id = p.id and m.canteen_id = p_canteen_id and m.role >= p_min_role
        )
        or (
          p.role = 'admin'
          and exists (
            select 1 from public.canteens k
            where k.id = p_canteen_id and k.college_id = p.college_id
          )
        )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- staff_orders_v: security definer (runs as owner, so it sees profiles that
-- staff cannot read directly). The canteen check inside the body is what keeps
-- students and other canteens' staff out; do not remove it.
-- ---------------------------------------------------------------------------
drop view public.staff_orders_v;

create view public.staff_orders_v with (security_invoker = false) as
select
  o.id,
  o.code,
  o.status,
  o.total_paise,
  o.created_at,
  o.accepted_at,
  o.ready_at,
  o.collected_at,
  o.flagged_at,
  o.paid_at,
  o.slot_id,
  s.starts_at as slot_starts_at,
  o.student_id,
  p.full_name as student_name,
  p.reg_no,
  p.phone,
  o.canteen_id,
  k.name as canteen_name
from public.orders o
join public.slots s on s.id = o.slot_id
join public.profiles p on p.id = o.student_id
join public.canteens k on k.id = o.canteen_id
where public.has_canteen_role(o.canteen_id, 'staff');

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, then grant the minimum. Memberships, colleges
-- and canteens are written only with the service-role key.
-- ---------------------------------------------------------------------------
alter table public.colleges enable row level security;
alter table public.college_domains enable row level security;
alter table public.canteens enable row level security;
alter table public.canteen_members enable row level security;

revoke all on table
  public.colleges, public.college_domains, public.canteens, public.canteen_members, public.staff_orders_v
from anon, authenticated;

revoke all on function public.current_college_id() from public, anon;
revoke all on function public.has_canteen_role(uuid, public.canteen_role) from public, anon;
grant execute on function public.current_college_id() to authenticated;
grant execute on function public.has_canteen_role(uuid, public.canteen_role) to authenticated;

grant select on public.colleges, public.canteens, public.canteen_members, public.staff_orders_v to authenticated;
grant select on public.college_domains to anon, authenticated;
grant insert (canteen_id), update (canteen_id) on public.slots to authenticated;

-- ---------------------------------------------------------------------------
-- Policies. auth.uid(), current_role(), current_college_id() and has_canteen_role()
-- are wrapped in selects, as in 0002_rls.sql.
-- ---------------------------------------------------------------------------
create policy colleges_select_own on public.colleges
  for select to authenticated
  using (id = (select public.current_college_id()));

create policy college_domains_select on public.college_domains
  for select to anon, authenticated
  using (true);

create policy canteens_select on public.canteens
  for select to authenticated
  using (
    (status = 'approved' and college_id = (select public.current_college_id()))
    or (select public.has_canteen_role(id, 'staff'))
  );

create policy canteen_members_select on public.canteen_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_canteen_role(canteen_id, 'owner')));

-- profiles: self, or the admin of the same college.
drop policy profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_college_admin on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or ((select public.current_role()) = 'admin' and college_id = (select public.current_college_id()))
  );

-- orders and order_items: the canteen's staff (and the college admin).
drop policy orders_select_staff on public.orders;
create policy orders_select_staff on public.orders
  for select to authenticated
  using ((select public.has_canteen_role(canteen_id, 'staff')));

drop policy order_items_select_staff on public.order_items;
create policy order_items_select_staff on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and (select public.has_canteen_role(o.canteen_id, 'staff'))
  ));

-- menu_items and slots: readable when the canteen is approved and in the caller's college
-- (students), or by the canteen's staff; written by its owner (or the college admin).
drop policy menu_items_select on public.menu_items;
drop policy menu_items_admin_write on public.menu_items;

create policy menu_items_select on public.menu_items
  for select to authenticated
  using (
    exists (
      select 1 from public.canteens k
      where k.id = menu_items.canteen_id
        and k.status = 'approved'
        and k.college_id = (select public.current_college_id())
    )
    or (select public.has_canteen_role(canteen_id, 'staff'))
  );

create policy menu_items_owner_insert on public.menu_items
  for insert to authenticated
  with check ((select public.has_canteen_role(canteen_id, 'owner')));

create policy menu_items_owner_update on public.menu_items
  for update to authenticated
  using ((select public.has_canteen_role(canteen_id, 'owner')))
  with check ((select public.has_canteen_role(canteen_id, 'owner')));

create policy menu_items_owner_delete on public.menu_items
  for delete to authenticated
  using ((select public.has_canteen_role(canteen_id, 'owner')));

drop policy slots_select on public.slots;
drop policy slots_admin_write on public.slots;

create policy slots_select on public.slots
  for select to authenticated
  using (
    exists (
      select 1 from public.canteens k
      where k.id = slots.canteen_id
        and k.status = 'approved'
        and k.college_id = (select public.current_college_id())
    )
    or (select public.has_canteen_role(canteen_id, 'staff'))
  );

create policy slots_owner_insert on public.slots
  for insert to authenticated
  with check ((select public.has_canteen_role(canteen_id, 'owner')));

create policy slots_owner_update on public.slots
  for update to authenticated
  using ((select public.has_canteen_role(canteen_id, 'owner')))
  with check ((select public.has_canteen_role(canteen_id, 'owner')));

create policy slots_owner_delete on public.slots
  for delete to authenticated
  using ((select public.has_canteen_role(canteen_id, 'owner')));
