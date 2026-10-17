-- OAC pre-order: place_order and cancel_order.
-- Students never write orders directly (0002_rls.sql grants select only); these
-- security-definer functions are the only write path. Business rules raise a bare
-- error code as the message: SLOT_FULL, SLOT_CLOSED, DEFAULTER, ITEM_UNAVAILABLE,
-- EMPTY_ORDER, NOT_CANCELLABLE. Callers that are not active students get FORBIDDEN.

-- OAC- plus 5 characters from an alphabet without 0/1/I/O, readable on a phone.
create function public.generate_order_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text := 'OAC-';
begin
  for i in 1..5 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

create function public.place_order(p_slot_id uuid, p_items jsonb, p_request_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_existing public.orders;
  v_cutoff int;
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
  select count(*), sum(m.price_paise::bigint * l.qty)
    into v_found, v_total
  from jsonb_to_recordset(v_lines) as l(id uuid, qty int)
  join public.menu_items m on m.id = l.id and m.is_available;
  if v_found <> jsonb_array_length(v_lines) then
    raise exception 'ITEM_UNAVAILABLE';
  end if;

  select s.order_cutoff_minutes into v_cutoff from public.app_settings s;

  -- Lock-free capacity claim: one atomic conditional UPDATE. Of N concurrent callers
  -- for the last seat, Postgres re-evaluates the WHERE for the waiters after the first
  -- commits, so exactly one wins.
  update public.slots s
  set booked_count = s.booked_count + 1
  where s.id = p_slot_id
    and s.booked_count < s.capacity
    and s.starts_at > now() + make_interval(mins => v_cutoff)
  returning * into v_slot;

  if not found then
    select * into v_slot from public.slots s where s.id = p_slot_id;
    if not found or v_slot.starts_at <= now() + make_interval(mins => v_cutoff) then
      raise exception 'SLOT_CLOSED';
    end if;
    raise exception 'SLOT_FULL';
  end if;

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.orders (code, student_id, slot_id, total_paise, request_id)
      values (public.generate_order_code(), v_uid, p_slot_id, v_total, p_request_id)
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

create function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Another student's order, a missing order and a non-cancellable one look the same.
  select * into v_order
  from public.orders o
  where o.id = p_order_id and o.student_id = v_uid and o.status = 'placed'
  for update;
  if not found then
    raise exception 'NOT_CANCELLABLE';
  end if;

  update public.orders o set status = 'cancelled' where o.id = v_order.id returning * into v_order;
  update public.slots s set booked_count = s.booked_count - 1 where s.id = v_order.slot_id;

  return v_order;
end;
$$;

revoke all on function public.generate_order_code() from public, anon, authenticated;
revoke all on function public.place_order(uuid, jsonb, uuid) from public, anon;
revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.place_order(uuid, jsonb, uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
