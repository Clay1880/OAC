-- OAC pre-order: admin RPCs for slots, and live menu updates.
-- Errors: FORBIDDEN (not an active admin), INVALID_RANGE, BELOW_BOOKED, SLOT_NOT_FOUND.

-- Slots for one campus day, every p_minutes from p_from up to (not including) p_to, in campus time.
-- Idempotent: a slot that already exists at that start time is left alone. Returns slots created.
create function public.generate_slots(p_day date, p_from time, p_to time, p_minutes int, p_capacity int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'Asia/Kolkata';
  v_start timestamptz;
  v_end timestamptz;
  v_created int;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_day is null or p_from is null or p_to is null or p_minutes is null or p_capacity is null
     or p_minutes <= 0 or p_capacity <= 0 or p_to <= p_from then
    raise exception 'INVALID_RANGE';
  end if;

  v_start := (p_day + p_from) at time zone v_tz;
  v_end := (p_day + p_to) at time zone v_tz;

  -- A day has at most 1440 one-minute slots; refuse anything that would be a typo-sized insert.
  if (extract(epoch from (v_end - v_start)) / 60)::int / p_minutes > 288 then
    raise exception 'INVALID_RANGE';
  end if;

  insert into public.slots (starts_at, capacity)
  select s, p_capacity
  from generate_series(v_start, v_end - interval '1 microsecond', make_interval(mins => p_minutes)) as s
  on conflict (starts_at) do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

create function public.set_slot_capacity(p_slot_id uuid, p_capacity int)
returns public.slots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.slots;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_capacity is null or p_capacity <= 0 then
    raise exception 'INVALID_RANGE';
  end if;

  -- Lock the row so a seat claimed at the same instant is counted before the check.
  select * into v_slot from public.slots s where s.id = p_slot_id for update;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;
  if p_capacity < v_slot.booked_count then
    raise exception 'BELOW_BOOKED';
  end if;

  update public.slots s set capacity = p_capacity where s.id = p_slot_id returning * into v_slot;
  return v_slot;
end;
$$;

revoke all on function public.generate_slots(date, time, time, int, int) from public, anon;
revoke all on function public.set_slot_capacity(uuid, int) from public, anon;
grant execute on function public.generate_slots(date, time, time, int, int) to authenticated;
grant execute on function public.set_slot_capacity(uuid, int) to authenticated;

-- The student menu follows admin edits (sold out, new items) without a refresh.
alter publication supabase_realtime add table public.menu_items;
