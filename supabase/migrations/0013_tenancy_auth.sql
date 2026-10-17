-- OAC platform: college_domains is the only source of allowed sign-up domains.
-- The sign-up guard stops reading app_settings, and app_settings (with its admin-writable
-- global row) is dropped. Every other reader moved to canteens/colleges in 0009.

-- ---------------------------------------------------------------------------
-- 1. Re-sync first: a domain set in app_settings after 0008 ran (and never copied into
--    college_domains) would otherwise strand every student of that domain.
-- ---------------------------------------------------------------------------
insert into public.college_domains (domain, college_id)
select s.college_email_domain, c.id
from public.app_settings s
cross join public.colleges c
where c.slug = 'ait-pune'
  and s.college_email_domain is not null
  and s.college_email_domain <> ''
  and not exists (
    select 1 from public.college_domains d where d.domain = s.college_email_domain
  );

-- ---------------------------------------------------------------------------
-- 2. College-email guard on auth.users.
-- Allowed: <local>@<any college_domains.domain>, or app_metadata.provisioned = true.
-- Inserts for the reserved staff login domain are let through here and verified at commit
-- by verify_staff_login_provisioned() (see 0001_schema.sql). An empty college_domains
-- table fails closed.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_college_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provisioned', '') = 'true' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.email ~* '^[^@]+@staff\.oac\.local$' then
    return new;
  end if;

  if new.email is null
     or new.email !~ '^[^@]+@[^@]+$'
     or not exists (
       select 1 from public.college_domains d
       where d.domain = lower(split_part(new.email, '@', 2))
     ) then
    raise exception 'Sign-up is restricted to college email addresses';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. app_settings is gone (its policies and grants go with it).
-- ---------------------------------------------------------------------------
drop table public.app_settings;
