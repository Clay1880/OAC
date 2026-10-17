-- OAC platform: security hardening from the whole-branch review.

-- ---------------------------------------------------------------------------
-- has_canteen_role: a membership counts only when the canteen is in the member's own college.
-- Memberships are written only with the service-role key, but a stray cross-college row
-- (a bug, or a bad manual fix) must grant nothing. Same signature and attributes as 0008,
-- so every policy, view and RPC that calls it picks this up.
-- ---------------------------------------------------------------------------
create or replace function public.has_canteen_role(p_canteen_id uuid, p_min_role public.canteen_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('staff', 'admin')
      and (
        exists (
          select 1
          from public.canteen_members m
          join public.canteens k on k.id = m.canteen_id
          where m.user_id = p.id
            and m.canteen_id = p_canteen_id
            and m.role >= p_min_role
            and k.college_id = p.college_id
        )
        or (
          p.role = 'admin'
          and exists (
            select 1 from public.canteens k
            where k.id = p_canteen_id and k.college_id = p.college_id
          )
        )
      )
  )
$$;

revoke all on function public.has_canteen_role(uuid, public.canteen_role) from public, anon;
grant execute on function public.has_canteen_role(uuid, public.canteen_role) to authenticated;

-- ---------------------------------------------------------------------------
-- A menu item or slot never changes canteen. Row policies alone let an owner of two canteens
-- move rows between them (USING and WITH CHECK both pass), so take away the column itself.
-- The admin console edits menu items with exactly these columns; insert and delete stay.
-- ---------------------------------------------------------------------------
revoke update (canteen_id) on public.slots from authenticated;

revoke update on public.menu_items from authenticated;
grant update (name, description, price_paise, category, is_available, sort, tags, meal_moments)
  on public.menu_items to authenticated;

-- ---------------------------------------------------------------------------
-- The definer views filter on has_canteen_role(); as security barriers, no caller-supplied
-- function or operator in a WHERE clause runs before that filter on rows it would hide.
-- ---------------------------------------------------------------------------
alter view public.staff_orders_v set (security_barrier = true);
alter view public.staff_feedback_v set (security_barrier = true);
