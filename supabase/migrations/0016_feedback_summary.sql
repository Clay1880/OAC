-- OAC: the staff feedback page's summary card, computed in SQL.
-- The page used to fetch every rating through PostgREST, which caps a response at 1000 rows, so
-- a busy canteen's count, average and distribution silently stopped growing. This returns one
-- row for the canteen's staff (and owner, and college admin), and zero rows for anyone else.
-- average is rounded to one decimal and null while there is no feedback.

create function public.feedback_summary(p_canteen_id uuid)
returns table (count bigint, average numeric, c1 bigint, c2 bigint, c3 bigint, c4 bigint, c5 bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*),
    round(avg(f.rating), 1),
    count(*) filter (where f.rating = 1),
    count(*) filter (where f.rating = 2),
    count(*) filter (where f.rating = 3),
    count(*) filter (where f.rating = 4),
    count(*) filter (where f.rating = 5)
  from public.order_feedback f
  where f.canteen_id = p_canteen_id
  having public.has_canteen_role(p_canteen_id, 'staff')
$$;

revoke all on function public.feedback_summary(uuid) from public, anon;
grant execute on function public.feedback_summary(uuid) to authenticated;
