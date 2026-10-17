-- OAC pre-order: staff lifecycle RPCs and defaulter rules.
-- accept_order, mark_ready, collect_order, flag_no_show are staff/admin only;
-- settle_no_show is admin only. Errors: FORBIDDEN (wrong or no role), ORDER_NOT_FOUND,
-- ILLEGAL_TRANSITION, HOLD_NOT_ELAPSED. Every function locks the order row first, then
-- (when it touches the defaulter flag) the student's profile row, so concurrent calls
-- never deadlock and the flag is recomputed against committed data.

-- Locks and returns the order, after checking the caller's role.
create function public.lock_order_for_staff(p_order_id uuid, p_admin_only boolean)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.current_role();
  v_order public.orders;
begin
  if v_role is null or v_role = 'student' or (p_admin_only and v_role <> 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  return v_order;
end;
$$;

-- Recomputes a student's defaulter flag: true while any no_show order is unpaid.
-- The explicit profile lock comes first so the exists() below runs in a fresh
-- statement, after any concurrent settle has committed.
create function public.refresh_defaulter(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles p where p.id = p_student_id for update;
  update public.profiles p
  set is_defaulter = exists (
    select 1 from public.orders o
    where o.student_id = p_student_id and o.status = 'no_show' and o.paid_at is null
  )
  where p.id = p_student_id;
end;
$$;

create function public.accept_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.lock_order_for_staff(p_order_id, false);
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
  v_order public.orders := public.lock_order_for_staff(p_order_id, false);
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
  v_order public.orders := public.lock_order_for_staff(p_order_id, false);
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

-- ready → no_show, only once the hold (no_show_hold_minutes after the slot starts) is over.
create function public.flag_no_show(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.lock_order_for_staff(p_order_id, false);
  v_starts_at timestamptz;
  v_hold int;
begin
  if v_order.status <> 'ready' then
    raise exception 'ILLEGAL_TRANSITION';
  end if;

  select s.starts_at into v_starts_at from public.slots s where s.id = v_order.slot_id;
  select a.no_show_hold_minutes into v_hold from public.app_settings a;
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

-- Admin records payment for a no_show order without handing it over.
create function public.settle_no_show(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := public.lock_order_for_staff(p_order_id, true);
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

revoke all on function public.lock_order_for_staff(uuid, boolean) from public, anon, authenticated;
revoke all on function public.refresh_defaulter(uuid) from public, anon, authenticated;
revoke all on function public.accept_order(uuid), public.mark_ready(uuid), public.collect_order(uuid),
  public.flag_no_show(uuid), public.settle_no_show(uuid) from public, anon;
grant execute on function public.accept_order(uuid), public.mark_ready(uuid), public.collect_order(uuid),
  public.flag_no_show(uuid), public.settle_no_show(uuid) to authenticated;
