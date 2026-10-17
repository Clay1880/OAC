-- OAC pre-order: student onboarding.
-- complete_profile is the only way a profile for a self-registered user comes to exist:
-- it always creates role 'student', so nobody can sign up into staff or admin. Staff and
-- admin profiles are created with the service-role key (create-admin.ts, createStaff).
-- Errors: INVALID_NAME, INVALID_PHONE, INVALID_REG_NO, REG_NO_TAKEN, PROFILE_EXISTS, FORBIDDEN.

create function public.complete_profile(p_full_name text, p_phone text, p_reg_no text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
  v_reg text := upper(btrim(coalesce(p_reg_no, '')));
  v_profile public.profiles;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'PROFILE_EXISTS';
  end if;

  if v_name = '' or length(v_name) > 100 then
    raise exception 'INVALID_NAME';
  end if;

  -- Ten-digit Indian mobile number, optionally written with +91 or 91.
  v_phone := regexp_replace(v_phone, '^(\+91|91)(?=[6-9][0-9]{9}$)', '');
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE';
  end if;

  if v_reg = '' or length(v_reg) > 32 then
    raise exception 'INVALID_REG_NO';
  end if;

  begin
    insert into public.profiles (id, full_name, phone, reg_no, role)
    values (v_uid, v_name, v_phone, v_reg, 'student')
    returning * into v_profile;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_pkey' then
      raise exception 'PROFILE_EXISTS';
    end if;
    raise exception 'REG_NO_TAKEN';
  end;

  return v_profile;
end;
$$;

revoke all on function public.complete_profile(text, text, text) from public, anon;
grant execute on function public.complete_profile(text, text, text) to authenticated;
