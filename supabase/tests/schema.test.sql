-- pgTAP tests: schema constraints, RLS, staff_orders_v, college-email guard.
-- Run with `npx supabase test db` (after `npx supabase db reset`, so seed.sql has set the college domain).
begin;
select plan(67);

-- ---------------------------------------------------------------------------
-- Fixtures (inserted as the superuser, so RLS and grants do not apply)
-- ---------------------------------------------------------------------------
-- The domain comes from app_settings (seeded locally as college.edu); never hard-coded here.
create temp table t_domain on commit drop as
  select college_email_domain as d from public.app_settings;
grant select on t_domain to authenticated;

select ok((select d is not null and d <> '' from t_domain),
  'precondition: app_settings.college_email_domain is seeded');

-- Auth users: college email, or provisioned (what the admin API does for staff/admin).
insert into auth.users (id, email, raw_app_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 's1@' || (select d from t_domain), '{}'),
  ('22222222-2222-2222-2222-222222222222', 's2@' || (select d from t_domain), '{}'),
  ('33333333-3333-3333-3333-333333333333', 'staff1@staff.oac.local', '{"provisioned": true}'),
  ('44444444-4444-4444-4444-444444444444', 'admin1@staff.oac.local', '{"provisioned": true}'),
  ('55555555-5555-5555-5555-555555555555', 'gone@staff.oac.local', '{"provisioned": true}');

insert into public.profiles (id, full_name, phone, reg_no, role, is_active) values
  ('11111111-1111-1111-1111-111111111111', 'Student One', '9000000001', 'REG001', 'student', true),
  ('22222222-2222-2222-2222-222222222222', 'Student Two', '9000000002', 'REG002', 'student', true),
  ('33333333-3333-3333-3333-333333333333', 'Staff One', null, null, 'staff', true),
  ('44444444-4444-4444-4444-444444444444', 'Admin One', null, null, 'admin', true),
  ('55555555-5555-5555-5555-555555555555', 'Gone Staff', null, null, 'staff', false);

insert into public.menu_items (id, name, price_paise, category) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Samosa', 1500, 'Snacks');

insert into public.slots (id, starts_at, capacity) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() + interval '1 hour', 10);

insert into public.orders (id, code, student_id, slot_id, total_paise, request_id) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'OAC-0001', '11111111-1111-1111-1111-111111111111',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1500, 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'OAC-0002', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3000, 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2');

insert into public.order_items (order_id, menu_item_id, name, unit_price_paise, qty) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Samosa', 1500, 1),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Samosa', 1500, 2);

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('11111111-1111-1111-1111-111111111111', 'https://push.example/s1', 'k', 'a'),
  ('22222222-2222-2222-2222-222222222222', 'https://push.example/s2', 'k', 'a');

-- ---------------------------------------------------------------------------
-- (a) College-email guard on auth.users
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'a@gmail.com')$$,
  'P0001', null, 'gmail address is rejected');

select lives_ok(
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'a@' || (select d from t_domain))$$,
  'college address is accepted');

select lives_ok(
  $$insert into auth.users (id, email) values (gen_random_uuid(), upper('B@' || (select d from t_domain)))$$,
  'college address is accepted case-insensitively');

select throws_ok(
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'a@evil' || (select d from t_domain))$$,
  'P0001', null, 'look-alike prefix domain is rejected');

select throws_ok(
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'a@' || (select d from t_domain) || '.evil.com')$$,
  'P0001', null, 'look-alike suffix domain is rejected');

select throws_ok(
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'a@gmail.com@' || (select d from t_domain))$$,
  'P0001', null, 'address with an embedded second @ is rejected');

select lives_ok(
  $$insert into auth.users (id, email, raw_app_meta_data)
    values (gen_random_uuid(), 'x@staff.oac.local', '{"provisioned": true}')$$,
  'provisioned (app_metadata) user is accepted regardless of domain');

select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'sneaky@gmail.com', '{"provisioned": true}')$$,
  'P0001', null, 'provisioned in user_metadata (self-signup) is still rejected');

select throws_ok(
  $$insert into auth.users (id, email, raw_app_meta_data)
    values (gen_random_uuid(), 'sneaky@gmail.com', '{"provisioned": false}')$$,
  'P0001', null, 'provisioned=false does not bypass the guard');

select throws_ok(
  $$insert into auth.users (id, phone) values (gen_random_uuid(), '+15550001')$$,
  'P0001', null, 'user without an email is rejected');

select throws_ok(
  $$update auth.users set email = 'changed@gmail.com' where id = '11111111-1111-1111-1111-111111111111'$$,
  'P0001', null, 'student cannot change email to a non-college address');

select lives_ok(
  $$update auth.users set email = 'renamed@' || (select d from t_domain) where id = '11111111-1111-1111-1111-111111111111'$$,
  'student can change email to another college address');

-- Reserved staff login domain: let through at INSERT (GoTrue sets app_metadata in a
-- later UPDATE of the same transaction) but must be provisioned by commit.
select lives_ok(
  $t$do $d$
    begin
      set constraints all deferred;
      insert into auth.users (id, email, raw_app_meta_data)
        values ('88888888-8888-8888-8888-888888888888', 'two-step@staff.oac.local', '{"provider": "email"}');
      update auth.users set raw_app_meta_data = raw_app_meta_data || '{"provisioned": true}'
        where id = '88888888-8888-8888-8888-888888888888';
      set constraints all immediate;
    end
  $d$$t$,
  'admin-API style create (insert, then provisioned UPDATE) is accepted');

select throws_ok(
  $t$do $d$
    begin
      set constraints all deferred;
      insert into auth.users (id, email) values (gen_random_uuid(), 'squatter@staff.oac.local');
      set constraints all immediate;
    end
  $d$$t$,
  'P0001', null, 'self-signup with a staff login address is rejected at commit');

select throws_ok(
  $$update auth.users set email = 'promoted@staff.oac.local' where id = '11111111-1111-1111-1111-111111111111'$$,
  'P0001', null, 'student cannot change email to a staff login address');

update public.app_settings set college_email_domain = null;
select throws_ok(
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'a@' || (select d from t_domain))$$,
  'P0001', null, 'guard fails closed when no college domain is configured');
select lives_ok(
  $$insert into auth.users (id, email, raw_app_meta_data)
    values (gen_random_uuid(), 'y@staff.oac.local', '{"provisioned": true}')$$,
  'provisioned users still work when no college domain is configured');
update public.app_settings set college_email_domain = (select d from t_domain);

-- ---------------------------------------------------------------------------
-- (b) Student order isolation
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.orders), 1, 'student sees exactly one order');
select is((select count(*)::int from public.orders where student_id = '22222222-2222-2222-2222-222222222222'),
  0, 'student sees none of another student''s orders');
select is((select count(*)::int from public.order_items where order_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'),
  0, 'student sees none of another student''s order items');
select is((select count(*)::int from public.order_items), 1, 'student sees own order items');
select is((select count(*)::int from public.push_subscriptions), 1, 'student sees only own push subscriptions');
select is((select count(*)::int from public.profiles), 1, 'student sees only own profile');
select is((select count(*)::int from public.menu_items where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1, 'student can read the menu');
select is((select count(*)::int from public.slots where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1, 'student can read slots');

-- ---------------------------------------------------------------------------
-- (c) Students cannot escalate or write directly
-- ---------------------------------------------------------------------------
select throws_ok($$update public.profiles set role = 'admin'$$, '42501', null,
  'student cannot make themselves admin');
select throws_ok($$update public.profiles set is_defaulter = false$$, '42501', null,
  'student cannot clear their defaulter flag');
select throws_ok(
  $$insert into public.orders (code, student_id, slot_id, total_paise, request_id)
    values ('OAC-HACK', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0, gen_random_uuid())$$,
  '42501', null, 'student cannot insert orders directly');
select throws_ok($$update public.orders set status = 'collected'$$, '42501', null,
  'student cannot update orders directly');
select throws_ok($$update public.slots set booked_count = 0$$, '42501', null,
  'student cannot touch slots.booked_count');
select is_empty(
  $$with u as (update public.menu_items set price_paise = 1 returning 1) select * from u$$,
  'student cannot update the menu (0 rows)');
select throws_ok(
  $$insert into public.menu_items (name, price_paise, category) values ('x', 1, 'x')$$,
  '42501', null, 'student cannot insert menu items');
select is_empty(
  $$with u as (update public.app_settings set order_cutoff_minutes = 0 returning 1) select * from u$$,
  'student cannot update app_settings (0 rows)');

-- ---------------------------------------------------------------------------
-- (d) staff_orders_v
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.staff_orders_v), 0, 'student reads 0 rows from staff_orders_v');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.staff_orders_v), 2, 'staff reads all orders from staff_orders_v');
select is((select phone from public.staff_orders_v where code = 'OAC-0001'), '9000000001',
  'staff_orders_v exposes the student phone');
select is((select count(*)::int from public.orders), 2, 'staff reads all orders');
select is((select count(*)::int from public.order_items), 2, 'staff reads all order items');
select is((select count(*)::int from public.profiles), 1, 'staff reads only their own profile directly');
select throws_ok($$update public.orders set status = 'collected'$$, '42501', null,
  'staff cannot update orders directly (RPC only)');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.staff_orders_v), 0, 'deactivated staff reads 0 rows from staff_orders_v');
select is((select count(*)::int from public.orders), 0, 'deactivated staff reads 0 orders');

reset role;
set local role anon;
select throws_ok($$select * from public.staff_orders_v$$, '42501', null, 'anon cannot read staff_orders_v');
select throws_ok($$select * from public.orders$$, '42501', null, 'anon cannot read orders');

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.profiles), 5, 'admin reads all profiles');
select lives_ok($$update public.menu_items set price_paise = 1600$$, 'admin can update the menu');
select lives_ok($$insert into public.slots (starts_at, capacity) values (now() + interval '2 hours', 5)$$,
  'admin can create slots');
select throws_ok($$update public.slots set booked_count = 1$$, '42501', null,
  'even admin cannot write slots.booked_count directly');

reset role;

-- ---------------------------------------------------------------------------
-- (e) Constraints
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.slots set booked_count = capacity + 1 where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23514', null, 'slots rejects booked_count > capacity');
select throws_ok(
  $$update public.slots set booked_count = -1 where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '23514', null, 'slots rejects negative booked_count');
select throws_ok(
  $$insert into public.slots (starts_at, capacity) values (now() + interval '9 hours', 0)$$,
  '23514', null, 'slots rejects capacity = 0');
select throws_ok(
  $$insert into public.slots (starts_at, capacity) values ((select starts_at from public.slots where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 5)$$,
  '23505', null, 'slots.starts_at is unique');
select throws_ok(
  $$insert into public.profiles (id, full_name, phone, reg_no, role) values ('22222222-2222-2222-2222-222222222222', 'Dup', '9', 'REG-DUP', 'student')$$,
  '23505', null, 'profiles pk is unique');
select throws_ok(
  $$insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 's6@' || (select d from t_domain));
    insert into public.profiles (id, full_name, role) values ('66666666-6666-6666-6666-666666666666', 'No Phone', 'student')$$,
  '23514', null, 'student profile requires phone and reg_no');
select throws_ok(
  $$insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777', 's7@' || (select d from t_domain));
    insert into public.profiles (id, full_name, phone, reg_no, role)
    values ('77777777-7777-7777-7777-777777777777', 'Dup Reg', '9000000007', 'REG001', 'student')$$,
  '23505', null, 'reg_no is unique');
select throws_ok(
  $$insert into public.orders (code, student_id, slot_id, total_paise, request_id)
    values ('OAC-DUP', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1,
            'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1')$$,
  '23505', null, 'orders unique(student_id, request_id) makes retries idempotent');
select throws_ok(
  $$insert into public.order_items (order_id, menu_item_id, name, unit_price_paise, qty)
    values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x', 1, 0)$$,
  '23514', null, 'order_items rejects qty = 0');
select throws_ok(
  $$insert into public.menu_items (name, price_paise, category) values ('neg', -1, 'x')$$,
  '23514', null, 'menu_items rejects negative price');

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.app_settings), 1, 'app_settings has exactly one row');
select throws_ok($$insert into public.app_settings (order_cutoff_minutes) values (1)$$, '23505', null,
  'app_settings cannot get a second row');
select results_eq(
  $$select order_cutoff_minutes, no_show_hold_minutes from public.app_settings$$,
  $$values (5, 15)$$, 'app_settings defaults are 5 and 15');
select has_index('public', 'orders', 'orders_slot_id_status_idx', 'index on orders(slot_id, status)');
select has_index('public', 'orders', 'orders_student_id_created_at_idx', 'index on orders(student_id, created_at desc)');
select has_index('public', 'orders', 'orders_status_created_at_idx', 'index on orders(status, created_at)');
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('orders', 'slots')),
  2, 'orders and slots are in the realtime publication');
select is(pg_get_functiondef('public.current_role()'::regprocedure) ~ 'search_path', true,
  'current_role pins its search_path');

select * from finish();
rollback;
