-- Popular here: how many orders each dish of a canteen got lately.
-- Counts only, never a student id. A caller sees rows when they are signed in and belong to the
-- canteen's college, or work at the canteen; everyone else gets zero rows.
--   p_days   look-back window, clamped to 1..90
--   p_limit  rows returned, clamped to 1..20
-- An order counts once however many of the dish it holds; cancelled and no_show orders and
-- sold-out dishes do not count.
create function public.popular_items(p_canteen_id uuid, p_days int default 30, p_limit int default 8)
returns table (menu_item_id uuid, orders bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select oi.menu_item_id, count(distinct o.id) as orders
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.menu_items m on m.id = oi.menu_item_id
  join public.canteens c on c.id = m.canteen_id
  where m.canteen_id = p_canteen_id
    and m.is_available
    and o.status not in ('cancelled', 'no_show')
    and o.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)))
    and (select auth.uid()) is not null
    and (
      c.college_id = (select public.current_college_id())
      or (select public.has_canteen_role(p_canteen_id, 'staff'))
    )
  group by oi.menu_item_id, m.name
  order by count(distinct o.id) desc, m.name
  limit greatest(1, least(coalesce(p_limit, 8), 20))
$$;

revoke all on function public.popular_items(uuid, int, int) from public, anon;
grant execute on function public.popular_items(uuid, int, int) to authenticated;
