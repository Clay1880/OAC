-- OAC pre-order: schema, helper, college-email guard.
-- All writes to profiles, orders, order_items and slots.booked_count go through
-- security-definer RPCs added in later migrations; see 0002_rls.sql for grants and policies.

create type public.user_role as enum ('student', 'staff', 'admin');
create type public.order_status as enum ('placed', 'accepted', 'ready', 'collected', 'cancelled', 'no_show');

-- ---------------------------------------------------------------------------
-- app_settings: a single row. college_email_domain is NULL until configured,
-- and the sign-up guard fails closed while it is NULL.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  order_cutoff_minutes int not null default 5 check (order_cutoff_minutes >= 0),
  no_show_hold_minutes int not null default 15 check (no_show_hold_minutes >= 0),
  college_email_domain text check (
    college_email_domain is null
    or (college_email_domain = lower(college_email_domain) and college_email_domain !~ '[@[:space:]]')
  )
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by RPC (students) or the admin script.
-- Staff and admin have no phone or registration number.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  reg_no text unique,
  role public.user_role not null default 'student',
  is_defaulter boolean not null default false,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_student_contact_required
    check (role <> 'student' or (phone is not null and reg_no is not null))
);

-- Role of the caller, or NULL when signed out, without a profile, or deactivated.
-- Always call it schema-qualified: `current_role` is also an SQL keyword.
create function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active
$$;

-- ---------------------------------------------------------------------------
-- Menu and slots
-- ---------------------------------------------------------------------------
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_paise int not null check (price_paise >= 0),
  category text not null,
  is_available boolean not null default true,
  sort int not null default 0
);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null unique,
  capacity int not null check (capacity > 0),
  booked_count int not null default 0,
  constraint slots_booked_count_within_capacity check (booked_count between 0 and capacity)
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  student_id uuid not null references public.profiles (id),
  slot_id uuid not null references public.slots (id),
  status public.order_status not null default 'placed',
  total_paise int not null check (total_paise >= 0),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  collected_at timestamptz,
  flagged_at timestamptz,
  paid_at timestamptz,
  unique (student_id, request_id)
);

create index orders_slot_id_status_idx on public.orders (slot_id, status);
create index orders_student_id_created_at_idx on public.orders (student_id, created_at desc);
create index orders_status_created_at_idx on public.orders (status, created_at);

-- name and unit price are snapshots taken at order time.
create table public.order_items (
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id),
  name text not null,
  unit_price_paise int not null check (unit_price_paise >= 0),
  qty int not null check (qty > 0),
  primary key (order_id, menu_item_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- staff_orders_v: security definer (runs as owner, so it sees profiles that
-- staff cannot read directly). The role check inside the body is what keeps
-- students out; do not remove it.
-- ---------------------------------------------------------------------------
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
  p.phone
from public.orders o
join public.slots s on s.id = o.slot_id
join public.profiles p on p.id = o.student_id
where public.current_role() in ('staff', 'admin');

-- ---------------------------------------------------------------------------
-- College-email guard on auth.users.
-- Allowed: <local>@<college_email_domain>, or app_metadata.provisioned = true.
-- app_metadata (raw_app_meta_data) can only be written with the service-role
-- admin API; sign-up data lands in raw_user_meta_data, which is never trusted.
--
-- GoTrue's admin createUser inserts the row first and writes app_metadata in a
-- later UPDATE of the same transaction, so at INSERT time a provisioned user
-- looks like any other. Inserts for the reserved staff login domain
-- (<id>@staff.oac.local, never deliverable) are therefore let through here and
-- verified at commit by verify_staff_login_provisioned() below.
-- ---------------------------------------------------------------------------
create function public.enforce_college_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text;
begin
  if coalesce(new.raw_app_meta_data ->> 'provisioned', '') = 'true' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.email ~* '^[^@]+@staff\.oac\.local$' then
    return new;
  end if;

  select s.college_email_domain into allowed from public.app_settings s;

  if allowed is null
     or allowed = ''
     or new.email is null
     or new.email !~ '^[^@]+@[^@]+$'
     or lower(split_part(new.email, '@', 2)) <> allowed then
    raise exception 'Sign-up is restricted to college email addresses';
  end if;

  return new;
end;
$$;

create trigger enforce_college_email_insert
  before insert on auth.users
  for each row execute function public.enforce_college_email();

create trigger enforce_college_email_update
  before update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.enforce_college_email();

-- Commit-time check: a staff-domain login must end the transaction provisioned.
-- Reads the row's final state (NEW is the version at INSERT time).
create function public.verify_staff_login_provisioned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from auth.users u
    where u.id = new.id
      and u.email ~* '^[^@]+@staff\.oac\.local$'
      and coalesce(u.raw_app_meta_data ->> 'provisioned', '') <> 'true'
  ) then
    raise exception 'Staff logins can only be created by an admin';
  end if;
  return null;
end;
$$;

create constraint trigger verify_staff_login_provisioned
  after insert on auth.users
  deferrable initially deferred
  for each row execute function public.verify_staff_login_provisioned();
