-- OAC pre-order: grants, row level security, realtime.
-- Writes to profiles, orders, order_items and slots.booked_count are not granted
-- to API roles at all; they happen only inside security-definer RPCs (later migrations)
-- or with the service-role key.

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.menu_items enable row level security;
alter table public.slots enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.push_subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, then grant the minimum.
-- ---------------------------------------------------------------------------
revoke all on table
  public.app_settings, public.profiles, public.menu_items, public.slots,
  public.orders, public.order_items, public.push_subscriptions, public.staff_orders_v
from anon, authenticated;

revoke all on function public.current_role() from public, anon;
revoke all on function public.enforce_college_email() from public, anon, authenticated;
revoke all on function public.verify_staff_login_provisioned() from public, anon, authenticated;
grant execute on function public.current_role() to authenticated;

grant select on public.profiles, public.orders, public.order_items, public.staff_orders_v to authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;
-- slots: admin may create, retime and resize; booked_count is RPC-only.
grant select, delete on public.slots to authenticated;
grant insert (starts_at, capacity), update (starts_at, capacity) on public.slots to authenticated;
grant select on public.app_settings to authenticated;
grant update (order_cutoff_minutes, no_show_hold_minutes, college_email_domain)
  on public.app_settings to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- Policies. auth.uid() and current_role() are wrapped in selects so Postgres
-- evaluates them once per statement, not once per row.
-- ---------------------------------------------------------------------------
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.current_role()) = 'admin');

create policy orders_select_own on public.orders
  for select to authenticated
  using (student_id = (select auth.uid()));

create policy orders_select_staff on public.orders
  for select to authenticated
  using ((select public.current_role()) in ('staff', 'admin'));

create policy order_items_select_own on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.student_id = (select auth.uid())
  ));

create policy order_items_select_staff on public.order_items
  for select to authenticated
  using ((select public.current_role()) in ('staff', 'admin'));

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy menu_items_select on public.menu_items
  for select to authenticated using (true);

create policy menu_items_admin_write on public.menu_items
  for all to authenticated
  using ((select public.current_role()) = 'admin')
  with check ((select public.current_role()) = 'admin');

create policy slots_select on public.slots
  for select to authenticated using (true);

create policy slots_admin_write on public.slots
  for all to authenticated
  using ((select public.current_role()) = 'admin')
  with check ((select public.current_role()) = 'admin');

create policy app_settings_select on public.app_settings
  for select to authenticated using (true);

create policy app_settings_admin_update on public.app_settings
  for update to authenticated
  using ((select public.current_role()) = 'admin')
  with check ((select public.current_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes respects the select policies above)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders, public.slots;
