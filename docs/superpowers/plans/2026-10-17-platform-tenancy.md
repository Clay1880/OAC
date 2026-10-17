# Platform Tenancy (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OAC ordering engine college- and canteen-aware (colleges → canteens → their own menu, slots, staff and orders) with every read and write isolated by canteen membership, while the app keeps working exactly as today for AIT Pune's single canteen.

**Architecture:** Three migrations add the tenancy tables and backfill today's data into one college ("AIT Pune") and one canteen ("OAC"), then rewrite the policies, the security-definer RPCs and the sign-up guard around two new helpers, `current_college_id()` and `has_canteen_role()`. The app gains a small `src/lib/tenancy` module that resolves "the canteen this screen is about" (the college's first approved canteen for students, the member's canteen for staff, the college's first canteen for the admin) so no screen needs a canteen picker yet. Phase 2 replaces those defaults with the campus feed.

**Tech Stack:** Next.js 16.4 (App Router), React 19, TypeScript, Tailwind 4, Supabase (Postgres RPCs + RLS + Realtime), Vitest integration tests against the local Supabase stack, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-campus-food-platform-design.md` (§4.1–4.3, §5 Phase 1, §7, §9)

## Global Constraints

- Read `node_modules/next/dist/docs/` before touching any Next.js code (AGENTS.md); this Next.js differs from training data.
- Every write to `profiles`, `orders`, `order_items`, `slots.booked_count`, `canteen_members` stays RPC-only or service-role-only; the browser never gets insert/update on them.
- `profiles.role` enum keeps its three values `student | staff | admin`. `staff` = works at one or more canteens; `admin` = college admin for `profiles.college_id`. The canteen rank (`owner | staff`) lives in `canteen_members.role`. No `platform_admin` in this phase: colleges and canteens are created by scripts with the service-role key.
- A college admin can do everything a canteen owner can for every canteen in their college (spec §9: AIT only; the existing admin console must keep working).
- The defaulter flag stays platform-wide: a student who owes any canteen is blocked everywhere (counter-pay only, spec §9 decision 3).
- Pay at the counter only. No payment columns anywhere.
- Money stays integer paise; slot maths stays in campus time; `colleges.timezone` defaults to `Asia/Kolkata`.
- Order codes become `<canteens.code_prefix>-XXXXX`, same alphabet as today; `orders.code` stays globally unique.
- Every migration runs on a database that already holds AIT data: add columns nullable, backfill, then `set not null`.
- Error codes are bare strings raised by RPCs, as today. New ones in this phase: `CANTEEN_UNAVAILABLE`, `NO_COLLEGE`.
- Phase 0 is a prerequisite, not a task: commit the uncommitted JavaGem redesign on `feat/oac-preorder`, merge to `main`, tag `v0-single-canteen`, branch `feat/platform-tenancy` from `main`.
- `npm test`, `npx supabase test db` and `npm run test:e2e` need `npx supabase start`; pgTAP needs `npx supabase db reset` first.

## Review Focus

1. **A suspended canteen.** Its menu and slots vanish for students and `place_order` refuses it, but staff can still accept, ready and collect the orders already placed. Tests: Task 1 (pgTAP, menu hidden), Task 2 (integration, `CANTEEN_UNAVAILABLE` and the lifecycle still runs).
2. **A slot from another canteen** sent with canteen A's cart (two tabs, stale client). `place_order` raises `SLOT_CLOSED` and books no seat on either canteen. Test: Task 2.
3. **A staff member of canteen A** acting on canteen B's order gets `FORBIDDEN` and the order does not change. Test: Task 2.
4. **A student whose email domain belongs to a second college** lands in that college and sees none of AIT's canteens. Tests: Task 1 (pgTAP isolation), Task 2 (`complete_profile` picks the college from the domain).
5. **A `staff` profile with no membership** (deleted canteen, half-finished provisioning) sees an empty console and gets `FORBIDDEN` on every action instead of seeing everything. Test: Task 2.

---

### Task 1: Tenancy schema, access helpers and policies

**Files:**
- Create: `supabase/migrations/0008_tenancy_schema.sql`
- Modify: `supabase/tests/schema.test.sql`, `supabase/seed.sql`, `tests/integration/helpers.ts`
- Test: `supabase/tests/schema.test.sql`

**Interfaces:**
- Produces SQL types: `public.canteen_status as enum ('pending','approved','suspended')`, `public.canteen_role as enum ('staff','owner')` (declared in this order so `'staff' < 'owner'`).
- Produces tables:
  - `colleges (id uuid pk default gen_random_uuid(), name text not null, slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'), timezone text not null default 'Asia/Kolkata', created_at timestamptz not null default now())`
  - `college_domains (domain text primary key check (domain = lower(domain) and domain !~ '[@[:space:]]'), college_id uuid not null references colleges on delete cascade)`
  - `canteens (id uuid pk default gen_random_uuid(), college_id uuid not null references colleges, name text not null, slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'), code_prefix text not null check (code_prefix ~ '^[A-Z0-9]{2,5}$'), status canteen_status not null default 'pending', description text, order_cutoff_minutes int not null default 5 check (>= 0), no_show_hold_minutes int not null default 15 check (>= 0), created_at timestamptz not null default now(), unique (college_id, slug), unique (college_id, code_prefix))`
  - `canteen_members (user_id uuid references profiles on delete cascade, canteen_id uuid references canteens on delete cascade, role canteen_role not null default 'staff', primary key (user_id, canteen_id))` + index on `(canteen_id)`.
- Produces columns: `profiles.college_id uuid not null references colleges`; `menu_items.canteen_id`, `slots.canteen_id`, `orders.canteen_id` all `uuid not null references canteens`. Drops `slots_starts_at_key`; adds `unique (canteen_id, starts_at)` on slots. Indexes: `menu_items (canteen_id, sort)`, `orders (canteen_id, status)`, `order_items (menu_item_id)`.
- Produces backfill: one college `('Army Institute of Technology, Pune', 'ait-pune')`, one canteen `('Open Area Canteen', 'oac', 'OAC', 'approved')` with cutoff/hold copied from `app_settings`; a `college_domains` row from `app_settings.college_email_domain` when it is not null; every existing profile, menu item, slot and order pointed at them.
- Produces functions (all `security definer`, `stable`, `set search_path = ''`, execute granted to `authenticated` only):
  - `public.current_college_id() returns uuid` — the caller's `profiles.college_id` when active, else null.
  - `public.has_canteen_role(p_canteen_id uuid, p_min_role public.canteen_role) returns boolean` — true when the caller is active and either a member of that canteen with `role >= p_min_role`, or `role = 'admin'` with `profiles.college_id = canteens.college_id`. Never true for students.
- Produces policies (replace the existing ones on the same tables):
  - `colleges`: select own college. `college_domains`: select for `anon` and `authenticated` (domains are public; the login form reads them).
  - `canteens`: select when `status = 'approved' and college_id = (select current_college_id())` or `(select has_canteen_role(id, 'staff'))`. No client writes.
  - `canteen_members`: select when `user_id = (select auth.uid())` or `(select has_canteen_role(canteen_id, 'owner'))`. No client writes.
  - `menu_items` and `slots`: select when the canteen is approved and in the caller's college, or `has_canteen_role(canteen_id, 'staff')`; insert/update/delete when `has_canteen_role(canteen_id, 'owner')`. Slots column grants gain `canteen_id`.
  - `orders` / `order_items` staff select: `has_canteen_role(canteen_id, 'staff')` (order_items via its order).
  - `profiles` select: self, or `current_role() = 'admin'` and same `college_id`.
- Produces view `staff_orders_v` (drop and recreate, re-grant select): today's columns plus `canteen_id` and `canteen_name`, filtered by `public.has_canteen_role(o.canteen_id, 'staff')` instead of the role check.
- Produces test helpers in `tests/integration/helpers.ts`:
  - `seededCollege(): Promise<{ id: string; domain: string }>` (slug `ait-pune`, cached), `seededCanteen(): Promise<{ id: string; code_prefix: string }>` (slug `oac`).
  - `createCollege(): Promise<{ id: string; domain: string }>` — random slug and domain `<slug>.test`.
  - `createCanteen(fields?: { collegeId?: string; status?: "pending" | "approved" | "suspended" }): Promise<{ id: string; college_id: string; code_prefix: string }>` — random slug and a random 3-letter prefix, approved by default.
  - `defaultCanteen(): Promise<{ id: string; college_id: string; code_prefix: string }>` — one approved canteen created lazily per test file; the default for everything below.
  - `createUser(role?, opts?: { canteenId?: string; canteenRole?: "staff" | "owner"; collegeId?: string })` — profile gets `college_id` (default: the default canteen's college); for `role = "staff"` a membership is inserted in `opts.canteenId ?? defaultCanteen()` with `opts.canteenRole ?? "staff"`.
  - `createMenuItem(fields?: { ...; canteen_id?: string })`, `createSlot(minutesFromNow, capacity, canteenId?)` default to `defaultCanteen()`.
  - `createUserWithoutProfile()` now uses an email on `seededCollege().domain`.
- Consumes: nothing from later tasks. Note for the reviewer: until Task 2 lands, every integration test that calls `place_order`, `generate_slots` or `complete_profile` is red (the old RPCs do not set the new `not null` columns). Task 1's gate is pgTAP, the unit tests and `npm run typecheck`.

- [ ] **Step 1: Write the failing pgTAP tests.** In `schema.test.sql` give every fixture a college and canteen: college `c0` (`ait-pune` from the backfill, read its id), a second college `cB` with domain `other.test`, canteens `oac` (backfilled), `k2` (approved, in `c0`, prefix `K2`), `kp` (pending, in `c0`), `kb` (approved, in `cB`). Memberships: Staff One → `oac` staff; a new `Owner One` (role staff) → `k2` owner; Admin One is `c0` admin; a new `Student B` in `cB`. Add, in the student section: `student sees items of approved canteens in own college only` (count of `menu_items` equals the number inserted for `oac` + `k2`), `student does not see the pending canteen's items`, `student does not see the other college's items`, `student does not see the suspended canteen's items` (update `k2` to suspended inside the test, then back). As Staff One: `staff_orders_v shows only own canteen's orders`, `staff cannot update another canteen's menu (0 rows)`, `staff cannot insert a slot into another canteen (42501)`. As Owner One: `owner can update own canteen's menu`, `owner cannot read other canteen's staff view rows`. As Admin One: `college admin reads every canteen's orders in the college`, `college admin reads no orders from the other college`, `college admin reads profiles of own college only`. As Student B: `student in college B sees no AIT canteens`. Keep the existing (a)–(d) sections; `app_settings` tests stay until Task 3. Update `plan(n)`.
- [ ] **Step 2: Run** `npx supabase db reset && npx supabase test db` — expect FAIL (relations `colleges`, `canteens` do not exist).
- [ ] **Step 3: Write `0008_tenancy_schema.sql`** in the order: types → tables → backfill rows → add nullable columns → backfill columns → `set not null` → constraints and indexes → helper functions → drop and recreate `staff_orders_v` → revoke/grant → policies. Policies wrap `auth.uid()`, `current_college_id()` and `has_canteen_role()` in `(select ...)` like `0002_rls.sql` does.
- [ ] **Step 4: Update `supabase/seed.sql`:** keep the `app_settings` update (the guard reads it until Task 3), add `insert into public.college_domains (domain, college_id) select 'aitpune.edu.in', id from public.colleges where slug = 'ait-pune' on conflict do nothing;` and give every menu row `canteen_id = (select id from public.canteens where slug = 'oac')`.
- [ ] **Step 5: Run** `npx supabase db reset && npx supabase test db` — expect PASS, all planned tests.
- [ ] **Step 6: Update `tests/integration/helpers.ts`** per the Interfaces block. Run `npx vitest run src && npm run typecheck` — expect PASS.
- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0008_tenancy_schema.sql supabase/tests/schema.test.sql supabase/seed.sql tests/integration/helpers.ts
git commit -m "feat(db): colleges, canteens and canteen-scoped policies"
```

### Task 2: Canteen-aware RPCs

**Files:**
- Create: `supabase/migrations/0009_tenancy_rpcs.sql`, `tests/integration/tenancy.test.ts`
- Modify: `tests/integration/place-order.test.ts`, `tests/integration/lifecycle.test.ts`, `tests/integration/admin.test.ts`, `tests/integration/admin-staff.test.ts`, `tests/integration/push.test.ts`, `tests/integration/profile.test.ts`, `src/lib/orders/types.ts`, `src/lib/auth/actions.ts`
- Test: all of `tests/integration/`

**Interfaces:**
- Consumes: `has_canteen_role`, `canteens.code_prefix / order_cutoff_minutes / no_show_hold_minutes`, `colleges.timezone` (Task 1).
- Produces SQL (old signatures dropped first):
  - `generate_order_code(p_prefix text) returns text` — `<p_prefix>-` + 5 chars from today's alphabet.
  - `place_order(p_canteen_id uuid, p_slot_id uuid, p_items jsonb, p_request_id uuid) returns orders`. After the profile checks: canteen must exist, be `approved` and have `college_id = v_profile.college_id`, else `CANTEEN_UNAVAILABLE`; items must be `is_available` **and** `canteen_id = p_canteen_id`, else `ITEM_UNAVAILABLE`; the capacity claim adds `and s.canteen_id = p_canteen_id`, and a slot that is missing, in another canteen or past cutoff raises `SLOT_CLOSED`; cutoff read from the canteen row; inserts `canteen_id`. Idempotency lock and retry loop unchanged.
  - `lock_order_for_staff(p_order_id uuid, p_min_role public.canteen_role) returns orders` — `FORBIDDEN` unless `current_role() in ('staff','admin')`; locks the row (`ORDER_NOT_FOUND`); then `FORBIDDEN` unless `has_canteen_role(v_order.canteen_id, p_min_role)`.
  - `accept_order`, `mark_ready`, `collect_order`, `flag_no_show` call it with `'staff'`; `settle_no_show` with `'owner'`. `flag_no_show` reads the hold from `canteens.no_show_hold_minutes` of the order's canteen.
  - `generate_slots(p_canteen_id uuid, p_day date, p_from time, p_to time, p_minutes int, p_capacity int) returns int` — `FORBIDDEN` unless `has_canteen_role(p_canteen_id, 'owner')`; timezone from the canteen's college; `on conflict (canteen_id, starts_at) do nothing`.
  - `set_slot_capacity(p_slot_id uuid, p_capacity int)` — role pre-check, lock, then `FORBIDDEN` unless `has_canteen_role(v_slot.canteen_id, 'owner')`.
  - `complete_profile(p_full_name, p_phone, p_reg_no)` resolves `v_college_id` from the caller's `auth.users.email` domain via `college_domains` (`lower(split_part(email, '@', 2))`); raises `NO_COLLEGE` when there is no match; inserts `college_id`.
  - `cancel_order`, `refresh_defaulter`, `upsert_push_subscription` unchanged.
- Produces TS: `PLACE_ORDER_ERRORS` gains `"CANTEEN_UNAVAILABLE"`; `Order` gains `canteen_id: string`; `CompleteProfileError` gains `"NO_COLLEGE"` and `completeProfile` maps it.

- [ ] **Step 1: Write the failing tests.** Update the existing files mechanically: every `place_order` call passes `p_canteen_id` (the canteen of the slot/items used, default `(await defaultCanteen()).id`); the code assertion becomes `` new RegExp(`^${canteen.code_prefix}-[2-9A-HJ-NP-Z]{5}$`) ``; `generate_slots` calls pass `p_canteen_id`, and the admin in `admin.test.ts` becomes `createUser("staff", { canteenRole: "owner" })` for the owner cases plus a kept `createUser("admin")` case named `college admin can generate slots for a canteen in the college`. Then write `tenancy.test.ts`:
  - `place_order refuses a pending canteen with CANTEEN_UNAVAILABLE` and `...a suspended canteen...`.
  - `place_order refuses a canteen in another college with CANTEEN_UNAVAILABLE` (student created with `collegeId` of `createCollege()`).
  - `a slot from another canteen raises SLOT_CLOSED and books no seat` — assert `bookedCount` of both slots is 0 (Review Focus 2).
  - `an item from another canteen raises ITEM_UNAVAILABLE`.
  - `order code uses the canteen prefix`.
  - `staff of canteen A get FORBIDDEN on canteen B's order and the status is unchanged` for `accept_order` (Review Focus 3).
  - `an owner cannot settle another canteen's no-show`; `a college admin can settle any canteen's no-show in the college`.
  - `a staff profile with no membership reads 0 rows from staff_orders_v and gets FORBIDDEN from accept_order` (Review Focus 5; create with `createUser("staff", { canteenId: ... })` then delete the membership row with `admin`).
  - `orders on a canteen that is later suspended can still be accepted, readied and collected` (Review Focus 1).
  - `generate_slots is FORBIDDEN for a staff (non-owner) member`.
  - `flag_no_show uses the canteen's own hold minutes` (canteen with `no_show_hold_minutes = 1`, slot started 2 minutes ago → allowed; sibling canteen with 15 → `HOLD_NOT_ELAPSED`).
  - In `profile.test.ts`: `sets college_id from the email domain` (expect the seeded college id); `a user on the second college's domain lands in that college` (provisioned user with an email on `createCollege().domain`); `NO_COLLEGE when the email domain matches no college` (provisioned user on `nowhere.test`) (Review Focus 4).
- [ ] **Step 2: Run** `npx vitest run tests/integration` — expect FAIL (`place_order(uuid, uuid, jsonb, uuid)` does not exist, null `canteen_id`).
- [ ] **Step 3: Write `0009_tenancy_rpcs.sql`** per the Interfaces block, dropping each old signature before creating the new one, and re-issuing the `revoke ... from public, anon` / `grant execute ... to authenticated` lines for every function it creates.
- [ ] **Step 4: Update `src/lib/orders/types.ts` and `src/lib/auth/actions.ts`** per the Interfaces block.
- [ ] **Step 5: Run** `npx supabase db reset && npx vitest run tests/integration && npx supabase test db` — expect PASS. The 25-caller last-seat race test must still show exactly 5 successes.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0009_tenancy_rpcs.sql tests/integration src/lib/orders/types.ts src/lib/auth/actions.ts
git commit -m "feat(db): canteen-scoped order, lifecycle, slot and profile RPCs"
```

### Task 3: College-aware sign-up and onboarding

**Files:**
- Create: `supabase/migrations/0010_tenancy_auth.sql`
- Modify: `supabase/tests/schema.test.sql`, `supabase/seed.sql`, `src/lib/auth/validate.ts`, `src/lib/auth/validate.test.ts`, `src/lib/config.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/LoginForm.tsx`, `.env.example`, `.env.local`, `e2e/helpers.ts`, `e2e/auth.spec.ts`
- Test: `supabase/tests/schema.test.sql`, `src/lib/auth/validate.test.ts`, `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `college_domains` (Task 1); `complete_profile` already college-aware (Task 2).
- Produces SQL:
  - `enforce_college_email()` keeps the provisioned and staff-domain branches; the domain check becomes `exists (select 1 from public.college_domains d where d.domain = lower(split_part(new.email, '@', 2)))`. An empty table fails closed exactly as a null setting did.
  - `drop table public.app_settings` (every reader moved to `canteens` in Task 2; the guard moves here). `seed.sql` loses its `app_settings` line.
- Produces TS:
  - `isCollegeEmail(address: string, domains: readonly string[]): boolean` in `validate.ts` (true when the lower-cased domain is in the list).
  - `src/lib/config.ts` loses `COLLEGE_EMAIL_DOMAIN` and `requireCollegeEmailDomain`; `.env.example` loses `NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN`.
  - `login/page.tsx` (server component) reads `college_domains` ordered by `domain` with the server client and passes `domains: string[]` to `LoginForm({ domains })`; the form validates with `isCollegeEmail(address, domains)`, uses `domains[0]` in the placeholder, and shows "Sign-in is not set up yet. Please tell the canteen admin." when the list is empty.
  - `e2e/helpers.ts`: `collegeDomain(): Promise<string>` reads the first `college_domains` row with `admin`; `uniqueEmail()` becomes async and every caller awaits it.

- [ ] **Step 1: Write the failing tests.** pgTAP section (a): `t_domain` is read from `college_domains`; the fail-closed test deletes all `college_domains` rows (inside the test transaction) instead of nulling `app_settings`; add `email on the second college's domain is accepted`. Remove the `app_settings` assertions in section (c). `validate.test.ts`: list-based cases incl. uppercase domain and an address on a look-alike domain. `e2e/auth.spec.ts`: the rejection copy becomes `Use your college email address (ending in @<domain>).` with the domain read from the DB.
- [ ] **Step 2: Run** `npx supabase db reset && npx supabase test db && npx vitest run src/lib/auth` — expect FAIL.
- [ ] **Step 3: Write `0010_tenancy_auth.sql`**, drop the `app_settings` line from `seed.sql`, and make the TS changes per the Interfaces block.
- [ ] **Step 4: Run** the Step 2 command — expect PASS. Run `npx vitest run tests/integration && npm run typecheck && npm run lint` — expect PASS (nothing reads `app_settings` any more). Run `npx playwright test e2e/auth.spec.ts --project=mobile` — expect PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0010_tenancy_auth.sql supabase/tests/schema.test.sql supabase/seed.sql src/lib/auth src/lib/config.ts "src/app/(auth)/login" .env.example e2e/helpers.ts e2e/auth.spec.ts
git commit -m "feat(auth): college domains table drives sign-up and onboarding"
```

### Task 4: Student app on the college's default canteen

**Files:**
- Create: `src/lib/tenancy/types.ts`, `src/lib/tenancy/current.ts`, `src/lib/tenancy/current.test.ts`
- Modify: `src/app/(student)/page.tsx`, `src/app/(student)/checkout/page.tsx`, `src/components/MenuScreen.tsx`, `src/components/CheckoutScreen.tsx`, `src/components/HomeHero.tsx`, `src/lib/menu.ts`, `src/lib/useSlots.ts`, `src/lib/orders/actions.ts`, `e2e/helpers.ts`, `e2e/order.spec.ts`, `e2e/tracking.spec.ts`
- Test: `src/lib/tenancy/current.test.ts`, `e2e/order.spec.ts`, `e2e/tracking.spec.ts`

**Interfaces:**
- Consumes: `place_order(p_canteen_id, ...)` and `CANTEEN_UNAVAILABLE` (Task 2); `canteens` select policy (Task 1).
- Produces:
  - `type Canteen = { id: string; college_id: string; name: string; slug: string; code_prefix: string; status: "pending" | "approved" | "suspended"; order_cutoff_minutes: number; no_show_hold_minutes: number; created_at: string }` and `CANTEEN_COLUMNS` in `tenancy/types.ts`.
  - `pickDefaultCanteen(canteens: Canteen[]): Canteen | null` (pure): the approved canteen with the earliest `created_at`.
  - `studentCanteen(supabase: SupabaseClient): Promise<Canteen | null>` in `tenancy/current.ts`: selects `CANTEEN_COLUMNS` from `canteens` (RLS already limits it to approved canteens in the student's college) and returns `pickDefaultCanteen`.
  - `fetchMenu(canteenId: string)` filters by `canteen_id`; `MenuScreen({ canteen, initialItems })` subscribes with `filter: \`canteen_id=eq.${canteen.id}\`` and shows `canteen.name` in `HomeHero` ("Pickup from") instead of the hard-coded "AIT Pune canteen".
  - `useSlots(initial, serverNowIso, cutoffMinutes, canteenId: string)` filters the refresh query and the Realtime channel by canteen.
  - `placeOrder(input: { canteenId: string; slotId: string; items: ...; requestId: string })`; `CheckoutScreen` gets `canteen: Canteen`, passes `canteen.id` and `canteen.order_cutoff_minutes`, and `ERROR_COPY.CANTEEN_UNAVAILABLE = "This canteen is not taking orders right now."`.
  - Checkout page reads the cutoff from the canteen row (not `app_settings`, which is gone) and filters menu and slots by `canteen.id`.
  - Both student pages render `EmptyState` titled "No canteen is open yet" when `studentCanteen()` is null.
  - `e2e/helpers.ts`: `createMenuItem` and `createSlot` calls made for the UI target `seededCanteen()` (slug `oac`), which is the canteen the demo student sees.

- [ ] **Step 1: Write the failing tests.** `current.test.ts`: `pickDefaultCanteen` returns the earliest approved canteen, ignores pending and suspended ones, returns null for an empty list. e2e `order.spec.ts`: existing cases pass unchanged in behaviour; add `a second approved canteen's items are not on the home screen` (create an item in `createCanteen()` and assert its `data-item-id` is absent); the home header shows "Open Area Canteen".
- [ ] **Step 2: Run** `npx vitest run src/lib/tenancy && npx playwright test e2e/order.spec.ts --project=mobile` — expect FAIL.
- [ ] **Step 3: Implement** the tenancy module, then thread `canteen` through the two pages and the components per the Interfaces block. Polished states only: no raw error text.
- [ ] **Step 4: Run** `npx vitest run && npx playwright test e2e/order.spec.ts e2e/tracking.spec.ts --project=mobile && npm run typecheck && npm run lint` — expect PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/tenancy src/lib/menu.ts src/lib/useSlots.ts src/lib/orders/actions.ts "src/app/(student)" src/components/MenuScreen.tsx src/components/CheckoutScreen.tsx src/components/HomeHero.tsx e2e/helpers.ts e2e/order.spec.ts e2e/tracking.spec.ts
git commit -m "feat(student): menu, slots and checkout scoped to the default canteen"
```

### Task 5: Staff and admin consoles scoped to a canteen

**Files:**
- Modify: `src/lib/tenancy/current.ts`, `src/lib/staff/types.ts`, `src/app/staff/page.tsx`, `src/components/staff/StaffConsole.tsx`, `src/app/admin/menu/page.tsx`, `src/app/admin/slots/page.tsx`, `src/app/admin/staff/page.tsx`, `src/components/admin/MenuAdmin.tsx`, `src/components/admin/SlotsAdmin.tsx`, `src/components/admin/StaffAdmin.tsx`, `src/lib/admin/staff.ts`, `src/lib/admin/actions.ts`, `tests/integration/admin-staff.test.ts`, `e2e/helpers.ts`, `e2e/staff.spec.ts`, `e2e/admin.spec.ts`
- Test: `tests/integration/admin-staff.test.ts`, `e2e/staff.spec.ts`, `e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `has_canteen_role`, `canteen_members` (Task 1); `generate_slots(p_canteen_id, ...)`, `set_slot_capacity` (Task 2); `Canteen`, `studentCanteen` (Task 4).
- Produces:
  - `consoleCanteen(supabase: SupabaseClient): Promise<Canteen | null>` in `tenancy/current.ts`: for a `staff` profile, the canteen of the caller's membership with the earliest canteen `created_at`; for an `admin`, the earliest-created canteen in their college (any status). Read `canteen_members` first; fall back to `canteens` only for admins.
  - `StaffOrder` gains `canteen_id: string; canteen_name: string`.
  - `src/app/staff/page.tsx` reads `holdMinutes` from `consoleCanteen()` (`no_show_hold_minutes`), and renders `EmptyState` "You are not assigned to a canteen yet" when it is null. The console's fetch is unchanged: `staff_orders_v` is already membership-filtered.
  - `provisionStaff(service, input: { loginId: string; fullName: string; canteenId: string })` reads the canteen's `college_id` for the profile and inserts `canteen_members (user_id, canteen_id, role 'staff')`; returns `{ ok: false, error: "CANTEEN_NOT_FOUND" }` for an unknown canteen. `createStaff` action takes and forwards `canteenId` after verifying with the caller's client that `has_canteen_role(canteenId, 'owner')` is true (an RPC call to the helper, which is granted to `authenticated`).
  - Admin pages: `menu`, `slots`, `staff` resolve `consoleCanteen()` and pass `canteenId` into `MenuAdmin` (inserts carry `canteen_id`), `SlotsAdmin` (`generate_slots` gets `p_canteen_id`) and `StaffAdmin` (`createStaff` gets `canteenId`; the staff list is the profiles joined through `canteen_members` for that canteen). Each page shows the canteen name under its `h1`. Defaulters page unchanged (college-wide by policy).

- [ ] **Step 1: Write the failing tests.** `admin-staff.test.ts`: `provisionStaff` cases pass `canteenId` and assert the membership row exists with role `staff` and the profile's `college_id` matches the canteen's college; `CANTEEN_NOT_FOUND for a random uuid`. e2e `staff.spec.ts`: existing cases with `createStaffLogin` now a member of `oac`; add `orders from another canteen never appear on the console`. e2e `admin.spec.ts`: existing cases; add `the staff list shows only this canteen's staff` and `creating a staff login makes them a member of the console's canteen` (assert via `admin` on `canteen_members`).
- [ ] **Step 2: Run** `npx vitest run tests/integration/admin-staff.test.ts && npx playwright test e2e/staff.spec.ts e2e/admin.spec.ts --project=mobile` — expect FAIL.
- [ ] **Step 3: Implement** per the Interfaces block. Keep the staff console one-handed and unchanged visually apart from the canteen name in the header.
- [ ] **Step 4: Run** `npx vitest run && npx playwright test --project=mobile && npm run typecheck && npm run lint` — expect PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/tenancy src/lib/staff/types.ts src/app/staff src/app/admin src/components/staff src/components/admin src/lib/admin tests/integration/admin-staff.test.ts e2e
git commit -m "feat(console): staff and admin screens scoped by canteen membership"
```

### Task 6: Operator scripts, demo seed and docs

**Files:**
- Create: `scripts/create-college.ts`, `scripts/create-canteen.ts`
- Modify: `scripts/create-admin.ts`, `scripts/seed-demo.ts`, `e2e/global-setup.ts`, `docs/superpowers/specs/2026-10-17-campus-food-platform-design.md` (§1.4 loose ends)
- Test: manual run of each script against the local stack; full suite

**Interfaces:**
- Consumes: every table from Task 1.
- Produces:
  - `npx tsx scripts/create-college.ts <slug> <domain> <name...>` — upserts a college by slug and adds the domain; prints the college id.
  - `npx tsx scripts/create-canteen.ts <college-slug> <canteen-slug> <code-prefix> <name...>` — upserts an approved canteen; prints its id.
  - `npx tsx scripts/create-admin.ts <college-slug> <login-id> <password> <full-name...>` — as today plus `college_id`; fails with a clear message when the college slug is unknown.
  - `seed-demo.ts`: profiles get `college_id` of `ait-pune`; `demo.staff` gets a `canteen_members` row (`oac`, `staff`); demo slots carry `canteen_id` of `oac`.
  - `e2e/global-setup.ts`: stale-slot cleanup keeps working (`starts_at` jitter rule unchanged; no canteen filter needed).

- [ ] **Step 1: Write the scripts** per the Interfaces block, sharing `findUserByEmail` by moving it to `scripts/lib.ts`.
- [ ] **Step 2: Run** `npx supabase db reset && npx tsx scripts/create-college.ts demo-college demo.test Demo College && npx tsx scripts/create-canteen.ts demo-college stall ST The Stall && npx tsx scripts/create-admin.ts ait-pune ait.admin oac-demo-123 AIT Admin && npx tsx scripts/seed-demo.ts` — expect each to print its success line; `select slug, status from canteens` shows `oac` and `stall` approved.
- [ ] **Step 3: Run the full suite** `npx supabase db reset && npm test && npx supabase test db && npm run test:e2e && npm run typecheck && npm run lint` — expect PASS everywhere.
- [ ] **Step 4: Update the spec's §1.4** to say which loose ends this phase closed (`order_items(menu_item_id)` index, `app_settings` removal) and that `NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN` is gone.
- [ ] **Step 5: Commit**

```bash
git add scripts e2e/global-setup.ts docs/superpowers/specs/2026-10-17-campus-food-platform-design.md
git commit -m "chore(tenancy): college and canteen scripts, demo seed, docs"
```

---

## Self-Review Notes

- **Spec coverage (§5 Phase 1):** migration with colleges, domains, canteens, members, `canteen_id` columns, per-canteen slot uniqueness and backfill (T1); guard and `complete_profile` on `college_domains` (T3); `has_canteen_role` and every policy and RPC rewritten, `place_order` verifying items and slot belong to the canteen (T1, T2); code prefix per canteen (T2); integration tests with a second canteen proving cross-canteen reads and writes fail (T1 pgTAP, T2 `tenancy.test.ts`); the app keeps working for AIT's single canteen (T4, T5); scripts to create a college and admin (T6).
- **Deliberately not in this phase:** canteen registration form and approval UI, owner console split, canteen switcher, per-canteen cart, campus feed (Phase 2–3). `@staff.oac.local` stays as the synthetic staff domain (renaming it is cosmetic).
- **Type consistency:** `has_canteen_role(uuid, canteen_role)` is the only access helper name used across T1–T5; `Canteen`, `studentCanteen`, `consoleCanteen` are defined in T4/T5 and consumed by name; `placeOrder` input key is `canteenId` everywhere; `p_canteen_id` is the first parameter of `place_order` and `generate_slots`.
- **Transient red:** Task 1 leaves the `place_order`, `generate_slots` and `complete_profile` integration tests red until Task 2 restores every RPC; the reviewer gates Task 1 on pgTAP, unit tests and typecheck as stated. From Task 2 on, the whole integration suite is green at every task boundary.
- **Dependencies:** strictly sequential T1 → T2 → T3 → T4 → T5 → T6. T4 and T5 both touch `src/lib/tenancy/current.ts` (T4 creates it, T5 adds one function).
