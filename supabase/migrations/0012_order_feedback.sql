-- OAC: star feedback after delivery.
-- A student rates an order once it is collected (the counter handed the food over): 1 to 5 stars
-- and an optional comment of up to 500 characters, one per order. Staff of the order's canteen
-- (and the college admin) read it through staff_feedback_v. Students write only through
-- submit_feedback; the table itself takes no client writes.
-- Errors raised by submit_feedback: ORDER_NOT_FOUND, NOT_COLLECTED, INVALID_RATING,
-- INVALID_COMMENT, ALREADY_SUBMITTED.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.order_feedback (
  order_id uuid primary key references public.orders (id) on delete cascade,
  canteen_id uuid not null references public.canteens (id),
  student_id uuid not null references public.profiles (id),
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

create index order_feedback_canteen_id_created_at_idx on public.order_feedback (canteen_id, created_at desc);

-- ---------------------------------------------------------------------------
-- submit_feedback. The order row is locked first, so a double tap queues behind the first
-- call and finds its feedback; the unique violation handler covers any other race.
-- ---------------------------------------------------------------------------
create function public.submit_feedback(p_order_id uuid, p_rating int, p_comment text)
returns public.order_feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_order public.orders;
  v_feedback public.order_feedback;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'INVALID_COMMENT';
  end if;

  -- Only an active student can rate, and only their own order. Anything else looks the same.
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.is_active and p.role = 'student'
  ) then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  select * into v_order
  from public.orders o
  where o.id = p_order_id and o.student_id = v_uid
  for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.status <> 'collected' then
    raise exception 'NOT_COLLECTED';
  end if;

  if exists (select 1 from public.order_feedback f where f.order_id = v_order.id) then
    raise exception 'ALREADY_SUBMITTED';
  end if;

  begin
    insert into public.order_feedback (order_id, canteen_id, student_id, rating, comment)
    values (v_order.id, v_order.canteen_id, v_uid, p_rating, v_comment)
    returning * into v_feedback;
  exception when unique_violation then
    raise exception 'ALREADY_SUBMITTED';
  end;

  return v_feedback;
end;
$$;

-- ---------------------------------------------------------------------------
-- staff_feedback_v: security definer (runs as owner, so it sees student names and order
-- lines that staff cannot read directly). The canteen check inside the body is what keeps
-- students and other canteens' staff out; do not remove it.
-- ---------------------------------------------------------------------------
create view public.staff_feedback_v with (security_invoker = false) as
select
  f.order_id,
  f.canteen_id,
  f.rating,
  f.comment,
  f.created_at,
  o.code as order_code,
  p.full_name as student_name,
  coalesce(
    (
      select string_agg(oi.qty || '× ' || oi.name, ', ' order by oi.name)
      from public.order_items oi
      where oi.order_id = f.order_id
    ),
    ''
  ) as items
from public.order_feedback f
join public.orders o on o.id = f.order_id
join public.profiles p on p.id = f.student_id
where public.has_canteen_role(f.canteen_id, 'staff');

-- ---------------------------------------------------------------------------
-- Privileges and policies. No client writes: students go through submit_feedback.
-- ---------------------------------------------------------------------------
alter table public.order_feedback enable row level security;

revoke all on table public.order_feedback, public.staff_feedback_v from anon, authenticated;
grant select on public.order_feedback, public.staff_feedback_v to authenticated;

create policy order_feedback_select_own on public.order_feedback
  for select to authenticated
  using (student_id = (select auth.uid()));

create policy order_feedback_select_staff on public.order_feedback
  for select to authenticated
  using ((select public.has_canteen_role(canteen_id, 'staff')));

revoke all on function public.submit_feedback(uuid, int, text) from public, anon;
grant execute on function public.submit_feedback(uuid, int, text) to authenticated;
