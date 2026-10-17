-- pgTAP tests: schema constraints, RLS, staff_orders_v, college-email guard, canteen tenancy.
-- Run with `npx supabase test db` (after `npx supabase db reset`, so seed.sql has set the college domain).
begin;
select plan(80);

-- ---------------------------------------------------------------------------
-- Fixtures (inserted as the superuser, so RLS and grants do not apply)
-- ---------------------------------------------------------------------------
-- The domain comes from app_settings (seeded locally as aitpune.edu.in); never hard-coded here.
create temp table t_domain on commit drop as
  select college_email_domain as d from public.app_settings;
grant select on t_domain to authenticated;

select ok((select d is not null and d <> '' from t_domain),
  'precondition: app_settings.college_email_domain is seeded');

-- Tenancy: college c0 (ait-pune) and canteen oac come from the 0008 backfill.
-- College B (cbcb...) is a second college; canteens k2 (approved) and kp (pending) are in c0,
-- kb (approved) is in college B.
create temp table t_ids on commit drop as
  select c.id as c0, k.id as oac
  from public.colleges c
  join public.canteens k on k.college_id = c.id and k.slug = 'oac'
  where c.slug = 'ait-pune';
grant select on t_ids to authenticated;

insert into public.colleges (id, name, slug) values
  ('cbcbcbcb-cbcb-cbcb-cbcb-cbcbcbcbcbcb', 'College B', 'college-b');
insert into public.college_domains (domain, college_id) values
  ('other.test', 'cbcbcbcb-cbcb-cbcb-cbcb-cbcbcbcbcbcb');

insert into public.canteens (id, college_id, name, slug, code_prefix, status) values
  ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', (select c0 from t_ids), 'Canteen Two', 'k2', 'K2', 'approved'),
  ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3', (select c0 from t_ids), 'Pending Canteen', 'kp', 'KP', 'pending'),
  ('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4', 'cbcbcbcb-cbcb-cbcb-cbcb-cbcbcbcbcbcb', 'College B Canteen', 'kb', 'KB', 'approved');

-- Auth users: college email, or provisioned (what the admin API does for staff/admin).
insert into auth.users (id, email, raw_app_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 's1@' || (select d from t_domain), '{}'),
  ('22222222-2222-2222-2222-222222222222', 's2@' || (select d from t_domain), '{}'),
  ('33333333-3333-3333-3333-333333333333', 'staff1@staff.oac.local', '{"provisioned": true}'),
  ('44444444-4444-4444-4444-444444444444', 'admin1@staff.oac.local', '{"provisioned": true}'),
  ('55555555-5555-5555-5555-555555555555', 'gone@staff.oac.local', '{"provisioned": true}'),
  ('99999999-9999-9999-9999-999999999999', 'owner1@staff.oac.local', '{"provisioned": true}'),
  ('12121212-1212-1212-1212-121212121212', 'sb@other.test', '{"provisioned": true}');

insert into public.profiles (id, full_name, phone, reg_no, role, is_active, college_id) values
  ('11111111-1111-1111-1111-111111111111', 'Student One', '9000000001', 'REG001', 'student', true, (select c0 from t_ids)),
  ('22222222-2222-2222-2222-222222222222', 'Student Two', '9000000002', 'REG002', 'student', true, (select c0 from t_ids)),
  ('33333333-3333-3333-3333-333333333333', 'Staff One', null, null, 'staff', true, (select c0 from t_ids)),
  ('44444444-4444-4444-4444-444444444444', 'Admin One', null, null, 'admin', true, (select c0 from t_ids)),
  ('55555555-5555-5555-5555-555555555555', 'Gone Staff', null, null, 'staff', false, (select c0 from t_ids)),
  ('99999999-9999-9999-9999-999999999999', 'Owner One', null, null, 'staff', true, (select c0 from t_ids)),
  ('12121212-1212-1212-1212-121212121212', 'Student B', '9000000012', 'REGB01', 'student', true,
   'cbcbcbcb-cbcb-cbcb-cbcb-cbcbcbcbcbcb');

-- Staff One and (deactivated) Gone Staff work at oac; Owner One owns k2. Admin One is c0's admin.
insert into public.canteen_members (user_id, canteen_id, role) values
  ('33333333-3333-3333-3333-333333333333', (select oac from t_ids), 'staff'),
  ('55555555-5555-5555-5555-555555555555', (select oac from t_ids), 'staff'),
  ('99999999-9999-9999-9999-999999999999', 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'owner');

insert into public.menu_items (id, canteen_id, name, price_paise, category) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select oac from t_ids), 'Test Samosa', 1500, 'Snacks'),
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'K2 Dosa', 4000, 'South Indian'),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', 'e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3', 'KP Tea', 1000, 'Beverages'),
  ('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4', 'KB Thali', 6000, 'Meals');

-- What a c0 student should see: every item of oac (seeded menu included) and of k2.
create temp table t_menu_expected on commit drop as
  select count(*)::int as n from public.menu_items
  where canteen_id in ((select oac from t_ids), 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2');
grant select on t_menu_expected to authenticated;

insert into public.slots (id, canteen_id, starts_at, capacity) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', (select oac from t_ids), now() + interval '1 hour', 10),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', now() + interval '1 hour', 10),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', 'e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4', now() + interval '1 hour', 10);

insert into public.orders (id, canteen_id, code, student_id, slot_id, total_paise, request_id) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', (select oac from t_ids), 'OAC-0001', '11111111-1111-1111-1111-111111111111',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1500, 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', (select oac from t_ids), 'OAC-0002', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3000, 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2'),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'K2-0001', '22222222-2222-2222-2222-222222222222',
   'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 4000, 'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3'),
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', 'e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4', 'KB-0001', '12121212-1212-1212-1212-121212121212',
   'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', 6000, 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4');

insert into public.order_items (order_id, menu_item_id, name, unit_price_paise, qty) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Samosa', 1500, 1),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Samosa', 1500, 2),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', 'K2 Dosa', 4000, 1),
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'KB Thali', 6000, 1);

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
-- (b) Student order isolation and canteen visibility
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

select is((select count(*)::int from public.menu_items), (select n from t_menu_expected),
  'student sees items of approved canteens in own college only');
select is((select count(*)::int from public.menu_items where id = 'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3'),
  0, 'student does not see the pending canteen''s items');
select is((select count(*)::int from public.menu_items where id = 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4'),
  0, 'student does not see the other college''s items');

-- authenticated has no update grant on canteens: suspend k2 as the superuser, look as the
-- student, then restore it the same way.
reset role;
update public.canteens set status = 'suspended' where id = 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2';
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.menu_items where canteen_id = 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2'),
  0, 'student does not see the suspended canteen''s items');
reset role;
update public.canteens set status = 'approved' where id = 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2';
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- (c) Students cannot escalate or write directly
-- ---------------------------------------------------------------------------
select throws_ok($$update public.profiles set role = 'admin'$$, '42501', null,
  'student cannot make themselves admin');
select throws_ok($$update public.profiles set is_defaulter = false$$, '42501', null,
  'student cannot clear their defaulter flag');
select throws_ok(
  $$insert into public.orders (canteen_id, code, student_id, slot_id, total_paise, request_id)
    values ((select oac from t_ids), 'OAC-HACK', '11111111-1111-1111-1111-111111111111',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0, gen_random_uuid())$$,
  '42501', null, 'student cannot insert orders directly');
select throws_ok($$update public.orders set status = 'collected'$$, '42501', null,
  'student cannot update orders directly');
select throws_ok($$update public.slots set booked_count = 0$$, '42501', null,
  'student cannot touch slots.booked_count');
select is_empty(
  $$with u as (update public.menu_items set price_paise = 1 returning 1) select * from u$$,
  'student cannot update the menu (0 rows)');
select throws_ok(
  $$insert into public.menu_items (canteen_id, name, price_paise, category) values ((select oac from t_ids), 'x', 1, 'x')$$,
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

select is((select count(*)::int from public.staff_orders_v), 2, 'staff reads their canteen''s orders from staff_orders_v');
select is((select phone from public.staff_orders_v where code = 'OAC-0001'), '9000000001',
  'staff_orders_v exposes the student phone');
select is((select count(*)::int from public.orders), 2, 'staff reads their canteen''s orders');
select is((select count(*)::int from public.order_items), 2, 'staff reads their canteen''s order items');
select is((select count(*)::int from public.profiles), 1, 'staff reads only their own profile directly');
select throws_ok($$update public.orders set status = 'collected'$$, '42501', null,
  'staff cannot update orders directly (RPC only)');

select results_eq(
  $$select code, canteen_name from public.staff_orders_v order by code$$,
  $$values ('OAC-0001', 'Open Area Canteen'), ('OAC-0002', 'Open Area Canteen')$$,
  'staff_orders_v shows only own canteen''s orders');
select is_empty(
  $$with u as (update public.menu_items set price_paise = 1
     where id = 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2' returning 1) select * from u$$,
  'staff cannot update another canteen''s menu (0 rows)');
select throws_ok(
  $$insert into public.slots (canteen_id, starts_at, capacity)
    values ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', now() + interval '3 hours', 5)$$,
  '42501', null, 'staff cannot insert a slot into another canteen (42501)');

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
select is((select count(*)::int from public.college_domains where domain = 'other.test'), 1,
  'anon can read college domains');

-- ---------------------------------------------------------------------------
-- Canteen owner
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
set local role authenticated;

-- An unfiltered update touches only the owner's own canteen, though oac's items are visible too.
select results_eq(
  $$with u as (update public.menu_items set price_paise = 4500 returning id) select id from u$$,
  $$values ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2'::uuid)$$,
  'owner can update own canteen''s menu');
select results_eq(
  $$select code from public.staff_orders_v$$,
  $$values ('K2-0001')$$,
  'owner cannot read other canteen''s staff view rows');

-- ---------------------------------------------------------------------------
-- College admin
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.profiles), 6, 'college admin reads profiles of own college only');
select results_eq(
  $$select code from public.orders order by code$$,
  $$values ('K2-0001'), ('OAC-0001'), ('OAC-0002')$$,
  'college admin reads every canteen''s orders in the college');
select is((select count(*)::int from public.orders where canteen_id = 'e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4'), 0,
  'college admin reads no orders from the other college');
select lives_ok($$update public.menu_items set price_paise = 1600$$, 'admin can update the menu');
select lives_ok(
  $$insert into public.slots (canteen_id, starts_at, capacity) values ((select oac from t_ids), now() + interval '2 hours', 5)$$,
  'admin can create slots');
select throws_ok($$update public.slots set booked_count = 1$$, '42501', null,
  'even admin cannot write slots.booked_count directly');

-- ---------------------------------------------------------------------------
-- Student in the second college
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}', true);
set local role authenticated;

select results_eq(
  $$select slug from public.canteens$$,
  $$values ('kb')$$,
  'student in college B sees no AIT canteens');

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
  $$insert into public.slots (canteen_id, starts_at, capacity) values ((select oac from t_ids), now() + interval '9 hours', 0)$$,
  '23514', null, 'slots rejects capacity = 0');
select throws_ok(
  $$insert into public.slots (canteen_id, starts_at, capacity)
    values ((select oac from t_ids), (select starts_at from public.slots where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 5)$$,
  '23505', null, 'slots (canteen_id, starts_at) is unique');
select throws_ok(
  $$insert into public.profiles (id, full_name, phone, reg_no, role, college_id)
    values ('22222222-2222-2222-2222-222222222222', 'Dup', '9', 'REG-DUP', 'student', (select c0 from t_ids))$$,
  '23505', null, 'profiles pk is unique');
select throws_ok(
  $$insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 's6@' || (select d from t_domain));
    insert into public.profiles (id, full_name, role, college_id)
    values ('66666666-6666-6666-6666-666666666666', 'No Phone', 'student', (select c0 from t_ids))$$,
  '23514', null, 'student profile requires phone and reg_no');
select throws_ok(
  $$insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777', 's7@' || (select d from t_domain));
    insert into public.profiles (id, full_name, phone, reg_no, role, college_id)
    values ('77777777-7777-7777-7777-777777777777', 'Dup Reg', '9000000007', 'REG001', 'student', (select c0 from t_ids))$$,
  '23505', null, 'reg_no is unique');
select throws_ok(
  $$insert into public.orders (canteen_id, code, student_id, slot_id, total_paise, request_id)
    values ((select oac from t_ids), 'OAC-DUP', '11111111-1111-1111-1111-111111111111',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1')$$,
  '23505', null, 'orders unique(student_id, request_id) makes retries idempotent');
select throws_ok(
  $$insert into public.order_items (order_id, menu_item_id, name, unit_price_paise, qty)
    values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x', 1, 0)$$,
  '23514', null, 'order_items rejects qty = 0');
select throws_ok(
  $$insert into public.menu_items (canteen_id, name, price_paise, category) values ((select oac from t_ids), 'neg', -1, 'x')$$,
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
