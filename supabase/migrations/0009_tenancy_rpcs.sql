-- OAC platform: canteen-aware RPCs.
-- Every order, lifecycle and slot RPC now acts inside one canteen: place_order takes the
-- canteen the cart belongs to, staff and owners act only on their own canteen's rows (the
-- college admin on every canteen of the college), and cutoff, no-show hold, timezone and
-- order-code prefix come from the canteen and its college instead of app_settings.
-- complete_profile picks the student's college from the email domain.
-- New error codes: CANTEEN_UNAVAILABLE (place_order), NO_COLLEGE (complete_profile).
-- cancel_order, refresh_defaulter and upsert_push_subscription are unchanged.

-- ---------------------------------------------------------------------------
-- Order code: <canteen prefix>- plus 5 characters from an alphabet without 0/1/I/O.
-- ---------------------------------------------------------------------------
drop function public.generate_order_code();

create function public.generate_order_code(p_prefix text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text := p_prefix || '-';
begin
  for i in 1..5 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- place_order. Errors: FORBIDDEN, DEFAULTER, CANTEEN_UNAVAILABLE, EMPTY_ORDER,
-- ITEM_UNAVAILABLE, SLOT_CLOSED, SLOT_FULL.
-- ---------------------------------------------------------------------------
drop function public.place_order(uuid, jsonb, uuid);

create function public.place_order(p_canteen_id uuid, p_slot_id uuid, p_items jsonb, p_request_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_canteen public.canteens;
  v_existing public.orders;
  v_slot public.slots;
  v_total int;
  v_lines jsonb;
  v_found int;
  v_order public.orders;
  v_attempt int := 0;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Serialise retries and double-taps of the same request: the second caller waits
  -- here, then finds the first caller's order below instead of booking a second seat.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_request_id::text, 0));

  select * into v_existing
  from public.orders o
  where o.student_id = v_uid and o.request_id = p_request_id;
  if found then
    return v_existing;
  end if;

  select * into v_profile from public.profiles p where p.id = v_uid;
  if not found or not v_profile.is_active or v_profile.role <> 'student' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_profile.is_defaulter then
    raise exception 'DEFAULTER';
  end if;

  -- Only approved canteens of the student's own college take orders. A missing, pending,
  -- suspended or other-college canteen look the same.
  select * into v_canteen from public.canteens k where k.id = p_canteen_id;
  if not found or v_canteen.status <> 'approved' or v_canteen.college_id <> v_profile.college_id then
    raise exception 'CANTEEN_UNAVAILABLE';
  end if;

  -- A line without a positive integer quantity is not an order. Duplicate lines for the
  -- same item are merged (order_items is keyed by order and item). Malformed JSON is an
  -- empty order, not a server error.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  begin
    if exists (
      select 1 from jsonb_to_recordset(p_items) as l(menu_item_id uuid, qty int)
      where l.menu_item_id is null or l.qty is null or l.qty <= 0
    ) then
      raise exception 'EMPTY_ORDER';
    end if;

    select jsonb_agg(jsonb_build_object('id', l.menu_item_id, 'qty', l.qty))
      into v_lines
    from (
      select r.menu_item_id, sum(r.qty)::int as qty
      from jsonb_to_recordset(p_items) as r(menu_item_id uuid, qty int)
      group by r.menu_item_id
    ) l;
  exception
    when others then
      raise exception 'EMPTY_ORDER';
  end;

  -- Current prices and availability, read before the seat is claimed so the hot slot
  -- row is locked for as short a time as possible. Client-sent prices are never read.
  -- An item of another canteen counts as unavailable.
  select count(*), sum(m.price_paise::bigint * l.qty)
    into v_found, v_total
  from jsonb_to_recordset(v_lines) as l(id uuid, qty int)
  join public.menu_items m on m.id = l.id and m.is_available and m.canteen_id = p_canteen_id;
  if v_found <> jsonb_array_length(v_lines) then
    raise exception 'ITEM_UNAVAILABLE';
  end if;

  -- Lock-free capacity claim: one atomic conditional UPDATE. Of N concurrent callers
  -- for the last seat, Postgres re-evaluates the WHERE for the waiters after the first
  -- commits, so exactly one wins. A slot of another canteen never matches, so no seat
  -- is booked anywhere for a mismatched slot.
  update public.slots s
  set booked_count = s.booked_count + 1
  where s.id = p_slot_id
    and s.canteen_id = p_canteen_id
    and s.booked_count < s.capacity
    and s.starts_at > now() + make_interval(mins => v_canteen.order_cutoff_minutes)
  returning * into v_slot;

  if not found then
    -- Missing, in another canteen or past the cutoff: SLOT_CLOSED. Otherwise it is full.
    select * into v_slot from public.slots s where s.id = p_slot_id;
    if not found
       or v_slot.canteen_id <> p_canteen_id
       or v_slot.starts_at <= now() + make_interval(mins => v_canteen.order_cutoff_minutes) then
      raise exception 'SLOT_CLOSED';
    end if;
    raise exception 'SLOT_FULL';
  end if;

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.orders (canteen_id, code, student_id, slot_id, total_paise, request_id)
      values (p_canteen_id, public.generate_order_code(v_canteen.code_prefix), v_uid, p_slot_id, v_total, p_request_id)
      returning * into v_order;
      exit;
    exception when unique_violation then
      -- Only the code can collide here (the advisory lock rules out request_id).
      if v_attempt >= 10 then
        raise;
      end if;
    end;
  end loop;

  insert into public.order_items (order_id, menu_item_id, name, unit_price_paise, qty)
  select v_order.id, m.id, m.name, m.price_paise, l.qty
  from jsonb_to_recordset(v_lines) as l(id uuid, qty int)
  join public.menu_items m on m.id = l.id;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff lifecycle. Errors: FORBIDDEN (wrong role, or not this canteen's staff),
-- ORDER_NOT_FOUND, ILLEGAL_TRANSITION, HOLD_NOT_ELAPSED. Locking order is unchanged:
-- the order row first, then (when the defaulter flag moves) the student's profile row.
-- A suspended canteen's existing orders still run through the lifecycle.
-- ---------------------------------------------------------------------------
drop function public.accept_order(uuid);
drop function public.mark_ready(uuid);
drop function public.collect_order(uuid);
drop function public.flag_no_show(uuid);
drop function public.settle_no_show(uuid);
drop function public.lock_order_for_staff(uuid, boolean);

-- Locks and returns the order. The role pre-check runs before the lock so students never
-- take a row lock; the canteen check needs the row, so it runs after. A missing order is
-- ORDER_NOT_FOUND for any staff caller, as before.
create function public.lock_order_for_staff(p_order_id uuid, p_min_role public.canteen_role)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_role();
  v_order public.orders;
begin
  if v_role is null or v_role not in ('staff', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if not public.has_canteen_role(v_order.canteen_id, p_min_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v_order;
end;
$$;

create function public.accept_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.lock_order_for_staff(p_order_id, 'staff');
begin
  if v_order.status <> 'placed' then
    raise exception 'ILLEGAL_TRANSITION';
  end if;
  update public.orders o set status = 'accepted', accepted_at = now()
  where o.id = v_order.id returning * into v_order;
  return v_order;
end;
$$;

create function public.mark_ready(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.lock_order_for_staff(p_order_id, 'staff');
begin
  if v_order.status <> 'accepted' then
    raise exception 'ILLEGAL_TRANSITION';
  end if;
  update public.orders o set status = 'ready', ready_at = now()
  where o.id = v_order.id returning * into v_order;
  return v_order;
end;
$$;

-- ready → collected, or no_show → collected (a late arrival pays and takes the food).
create function public.collect_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.lock_order_for_staff(p_order_id, 'staff');
  v_was_no_show boolean;
begin
  if v_order.status not in ('ready', 'no_show') then
    raise exception 'ILLEGAL_TRANSITION';
  end if;
  v_was_no_show := v_order.status = 'no_show';

  update public.orders o set status = 'collected', collected_at = now(), paid_at = now()
  where o.id = v_order.id returning * into v_order;

  if v_was_no_show then
    perform public.refresh_defaulter(v_order.student_id);
  end if;
  return v_order;
end;
$$;

-- ready → no_show, only once the hold (the canteen's no_show_hold_minutes after the slot
-- starts) is over.
create function public.flag_no_show(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.lock_order_for_staff(p_order_id, 'staff');
  v_starts_at timestamptz;
  v_hold int;
begin
  if v_order.status <> 'ready' then
    raise exception 'ILLEGAL_TRANSITION';
  end if;

  select s.starts_at into v_starts_at from public.slots s where s.id = v_order.slot_id;
  select k.no_show_hold_minutes into v_hold from public.canteens k where k.id = v_order.canteen_id;
  if now() < v_starts_at + make_interval(mins => v_hold) then
    raise exception 'HOLD_NOT_ELAPSED';
  end if;

  update public.orders o set status = 'no_show', flagged_at = now()
  where o.id = v_order.id returning * into v_order;

  perform 1 from public.profiles p where p.id = v_order.student_id for update;
  update public.profiles p set is_defaulter = true where p.id = v_order.student_id;
  return v_order;
end;
$$;

-- The canteen's owner (or the college admin) records payment for a no_show order
-- without handing it over.
create function public.settle_no_show(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.lock_order_for_staff(p_order_id, 'owner');
begin
  if v_order.status <> 'no_show' or v_order.paid_at is not null then
    raise exception 'ILLEGAL_TRANSITION';
  end if;
  update public.orders o set paid_at = now()
  where o.id = v_order.id returning * into v_order;

  perform public.refresh_defaulter(v_order.student_id);
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Slots. Errors: FORBIDDEN (not the canteen's owner or college admin), INVALID_RANGE,
-- BELOW_BOOKED, SLOT_NOT_FOUND.
-- ---------------------------------------------------------------------------
drop function public.generate_slots(date, time, time, int, int);
drop function public.set_slot_capacity(uuid, int);

-- Slots for one campus day of one canteen, every p_minutes from p_from up to (not including)
-- p_to, in the college's timezone. Idempotent: a slot that already exists at that start time
-- in this canteen is left alone. Returns slots created.
create function public.generate_slots(
  p_canteen_id uuid, p_day date, p_from time, p_to time, p_minutes int, p_capacity int
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_created int;
begin
  if not public.has_canteen_role(p_canteen_id, 'owner') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_day is null or p_from is null or p_to is null or p_minutes is null or p_capacity is null
     or p_minutes <= 0 or p_capacity <= 0 or p_to <= p_from then
    raise exception 'INVALID_RANGE';
  end if;

  select c.timezone into v_tz
  from public.canteens k
  join public.colleges c on c.id = k.college_id
  where k.id = p_canteen_id;

  v_start := (p_day + p_from) at time zone v_tz;
  v_end := (p_day + p_to) at time zone v_tz;

  -- A day has at most 1440 one-minute slots; refuse anything that would be a typo-sized insert.
  if (extract(epoch from (v_end - v_start)) / 60)::int / p_minutes > 288 then
    raise exception 'INVALID_RANGE';
  end if;

  insert into public.slots (canteen_id, starts_at, capacity)
  select p_canteen_id, s, p_capacity
  from generate_series(v_start, v_end - interval '1 microsecond', make_interval(mins => p_minutes)) as s
  on conflict (canteen_id, starts_at) do nothing;

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
  v_role public.user_role := public.current_role();
  v_slot public.slots;
begin
  -- Role pre-check before the lock so students never take a row lock.
  if v_role is null or v_role not in ('staff', 'admin') then
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
  if not public.has_canteen_role(v_slot.canteen_id, 'owner') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_capacity < v_slot.booked_count then
    raise exception 'BELOW_BOOKED';
  end if;

  update public.slots s set capacity = p_capacity where s.id = p_slot_id returning * into v_slot;
  return v_slot;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_profile. Errors: INVALID_NAME, INVALID_PHONE, INVALID_REG_NO, REG_NO_TAKEN,
-- PROFILE_EXISTS, NO_COLLEGE, FORBIDDEN. The college comes from the caller's email domain.
-- ---------------------------------------------------------------------------
drop function public.complete_profile(text, text, text);

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
  v_college_id uuid;
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

  -- A session whose auth user is gone (e.g. the database was reset) gets the error the
  -- profile's foreign key used to raise, so the app still ends that stale session.
  if not exists (select 1 from auth.users u where u.id = v_uid) then
    raise exception 'SESSION_EXPIRED' using errcode = '23503';
  end if;

  select d.college_id into v_college_id
  from auth.users u
  join public.college_domains d on d.domain = lower(split_part(u.email, '@', 2))
  where u.id = v_uid;
  if v_college_id is null then
    raise exception 'NO_COLLEGE';
  end if;

  begin
    insert into public.profiles (id, full_name, phone, reg_no, role, college_id)
    values (v_uid, v_name, v_phone, v_reg, 'student', v_college_id)
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

-- ---------------------------------------------------------------------------
-- Privileges: the helpers stay internal; every RPC is for signed-in callers only.
-- ---------------------------------------------------------------------------
revoke all on function public.generate_order_code(text) from public, anon, authenticated;
revoke all on function public.lock_order_for_staff(uuid, public.canteen_role) from public, anon, authenticated;

revoke all on function
  public.place_order(uuid, uuid, jsonb, uuid),
  public.accept_order(uuid), public.mark_ready(uuid), public.collect_order(uuid),
  public.flag_no_show(uuid), public.settle_no_show(uuid),
  public.generate_slots(uuid, date, time, time, int, int), public.set_slot_capacity(uuid, int),
  public.complete_profile(text, text, text)
from public, anon;

grant execute on function
  public.place_order(uuid, uuid, jsonb, uuid),
  public.accept_order(uuid), public.mark_ready(uuid), public.collect_order(uuid),
  public.flag_no_show(uuid), public.settle_no_show(uuid),
  public.generate_slots(uuid, date, time, time, int, int), public.set_slot_capacity(uuid, int),
  public.complete_profile(text, text, text)
to authenticated;
