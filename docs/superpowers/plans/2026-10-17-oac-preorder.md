# OAC Pre-Order App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first PWA where students pre-order from the OAC and pick a capped pickup slot, staff process orders live, and students collect and pay at the counter by showing a unique order ID.

**Architecture:** Next.js App Router frontend and server actions on top of Supabase. Postgres holds all business rules as `security definer` functions (RPCs) so slot capacity, defaulter blocking, and status transitions are atomic and cannot be bypassed from the client. Supabase Realtime pushes order changes to staff and students; Web Push sends the "ready" notification.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind CSS, Supabase (Postgres, Auth, Realtime) with Supabase CLI local stack, `@supabase/ssr`, `web-push`, Vitest, Playwright + `@axe-core/playwright`, pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-17-oac-preorder-design.md`

## Global Constraints

- Payment happens at the counter only. No payment gateway, ever (spec non-goal).
- Roles: `student`, `staff`, `admin`. Staff UI is designed phone-first, usable one-handed.
- Sign-up collects college email, phone number, registration number. Email must be verified.
- Slots have a fixed max number of orders set by admin; a full slot is unavailable; ordering for a slot closes shortly before it starts.
- No-show: staff hold an order for **15 minutes after the slot**, then flag it; the student becomes a **defaulter** and is **blocked from ordering** until they pay. If they arrive later, staff hand over the order if available, record payment, and the flag is removed.
- Admin sees defaulter name, phone, registration number, unpaid amount.
- Installable PWA. Must handle 2500+ students and a burst of hundreds of orders around the 1 pm break with no slot overbooking.
- Must not look "vibe-coded": deliberate visual identity, polished loading/empty/error/full-slot/offline states, mobile-first, accessible.
- My calls (spec-approved defaults, overridable): campus timezone `Asia/Kolkata`, currency stored as integer paise and shown in ₹, ordering cutoff 5 minutes before slot start, student cancel only while status is `placed`, staff/admin sign in with a login ID + password (ID maps internally to `<id>@staff.oac.local`), staff must change the temporary password on first login, admin can reset a password or deactivate a staff account.
- Accounts: students self-register (college email OTP). Staff are created only by the admin from the admin console. The admin account is provisioned by `scripts/create-admin.ts` and its credentials are handed over directly. Nobody can become staff or admin by signing up.

## Review Focus

Failure modes the spec implies that no feature task would otherwise test (each has a pinned test in the owning task):

1. Two students take the last seat in a slot at the same instant: exactly one succeeds, the other gets `SLOT_FULL` (Task 3).
2. A student double-taps "Place order" or retries after a flaky network: only one order exists (Task 3, `p_request_id` idempotency).
3. An item sells out or is repriced between add-to-cart and checkout: the order is rejected with the reason, and the total is always computed server-side (Task 3).
4. The phone's clock or timezone is wrong: slot times and cutoffs come from the server and display in campus time (Tasks 3, 6).
5. Push is denied or unsupported (iPhone in browser): the student still sees "Ready" live, and the page re-syncs when the app returns from background (Tasks 7, 10).

---

## File Structure

```
supabase/migrations/        # 0001_schema.sql, 0002_rls.sql, 0003_order_rpcs.sql, 0004_lifecycle_rpcs.sql, 0005_profile_rpc.sql, 0006_admin_rpcs.sql
supabase/tests/             # pgTAP: *.test.sql
supabase/seed.sql           # sample menu, slots (dev only)
scripts/create-admin.ts     # provision the admin account
scripts/load-test.ts        # burst test
src/app/(auth)/             # login (student OTP), staff-login (ID + password), verify, onboarding, change-password
src/app/(student)/          # menu, checkout, orders, orders/[code]
src/app/staff/              # counter console
src/app/admin/              # menu, slots, defaulters
src/app/api/push/           # subscribe route
src/components/ui/          # design-system primitives
src/lib/config.ts           # constants
src/lib/format.ts           # money and time formatting
src/lib/supabase/           # browser.ts, server.ts, admin.ts
src/lib/orders/             # types.ts, actions.ts (server actions)
src/lib/push/send.ts        # web-push sender
public/sw.js, public/manifest.webmanifest, public/icons/
tests/integration/          # Vitest against local Supabase
tests/e2e/                  # Playwright
```

---

### Task 1: Scaffold, tooling, design foundation

**Files:**
- Create: Next.js app in repo root (if `create-next-app` refuses the non-empty folder, scaffold in a temp dir and move; keep `docs/`), `src/lib/config.ts`, `src/lib/format.ts`, `src/components/ui/{Button,Card,Badge,Sheet,Toast,Skeleton,EmptyState}.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Produces: `config.ts` exports `CAMPUS_TZ = 'Asia/Kolkata'`, `NO_SHOW_HOLD_MINUTES = 15`, `ORDER_CUTOFF_MINUTES = 5`, `COLLEGE_EMAIL_DOMAIN` (from env). `format.ts` exports `formatPaise(paise: number): string` (→ `₹120.50`) and `formatSlotTime(iso: string): string` (→ `1:15 PM` in `CAMPUS_TZ`). UI primitives with a shared `className` prop and variants.

- [ ] **Step 1:** Prerequisites: Docker Desktop and Supabase CLI installed (`supabase --version`). `git init`, scaffold Next.js + TypeScript + Tailwind + ESLint + `src/` + App Router, add Vitest, Playwright, `@axe-core/playwright`. Use Context7 for current Next.js/Tailwind/Supabase setup syntax.
- [ ] **Step 2: Write failing tests** in `format.test.ts`: `formatPaise(12050) === '₹120.50'`, `formatPaise(0) === '₹0.00'`; `formatSlotTime('2026-10-19T07:45:00Z') === '1:15 PM'` (UTC 07:45 = IST 13:15 regardless of machine timezone — run the test with `TZ=UTC` and `TZ=America/New_York`).
- [ ] **Step 3: Run** `npx vitest run src/lib/format.test.ts` — expect FAIL (module missing).
- [ ] **Step 4:** Implement `format.ts` with `Intl.NumberFormat`/`Intl.DateTimeFormat` pinned to `CAMPUS_TZ`.
- [ ] **Step 5: Run** the same test under both `TZ` values — expect PASS.
- [ ] **Step 6: Design foundation** (my call, builder refines): warm off-white paper background, near-black ink, one saturated chili-red accent, plus a status color set (placed, accepted, ready, collected, no-show) defined as CSS variables in `globals.css`; `next/font` with Fraunces (display), Instrument Sans (body), JetBrains Mono (order codes, tabular numerals for prices). Staff screens: min 48px touch targets, high contrast. Motion is restrained and respects `prefers-reduced-motion`. No default shadcn look: custom radii, spacing scale, focus rings. Build the primitives listed above with loading/empty/error states.
- [ ] **Step 7: Commit** `chore: scaffold app and design foundation`

### Task 2: Schema, RLS, college-email guard

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `supabase/tests/schema.test.sql`, `supabase/seed.sql`, `scripts/create-admin.ts`

**Interfaces:**
- Produces tables: `profiles(id uuid pk → auth.users, full_name text, phone text, reg_no text unique nullable (null for staff/admin), role user_role default 'student', is_defaulter bool default false, is_active bool default true, must_change_password bool default false)`; `menu_items(id, name, description, price_paise int check >= 0, category, is_available bool, sort int)`; `slots(id, starts_at timestamptz unique, capacity int check > 0, booked_count int default 0 check (booked_count between 0 and capacity))`; `orders(id, code text unique, student_id, slot_id, status order_status, total_paise int, request_id uuid, created_at, accepted_at, ready_at, collected_at, flagged_at, paid_at, unique(student_id, request_id))`; `order_items(order_id, menu_item_id, name text, unit_price_paise int, qty int check > 0)`; `push_subscriptions(id, user_id, endpoint text unique, p256dh, auth)`; `app_settings` single row (`order_cutoff_minutes` 5, `no_show_hold_minutes` 15). Enums `user_role` (`student|staff|admin`), `order_status` (`placed|accepted|ready|collected|cancelled|no_show`). View `staff_orders_v` (security definer) = order + slot time + student name + reg_no + phone, readable by staff/admin only.
- Helper `public.current_role() returns user_role`.

- [ ] **Step 1: Write failing pgTAP tests** in `schema.test.sql`: (a) inserting an auth user with `a@gmail.com` raises (domain guard); `a@<COLLEGE_EMAIL_DOMAIN>` succeeds; a user whose `raw_app_meta_data` has `provisioned = true` (settable only via the service-role admin API, never by sign-up) succeeds regardless of domain; a self-signup passing `provisioned` in `user_metadata` is still rejected; (b) as a student, selecting another student's order returns 0 rows; (c) as a student, `update profiles set role='admin'` and `update profiles set is_defaulter=false` affect 0 rows or error; (d) as staff, `select from staff_orders_v` works; as student it returns 0 rows or errors; (e) `slots` rejects `booked_count > capacity`.
- [ ] **Step 2: Run** `supabase test db` — expect FAIL.
- [ ] **Step 3: Implement** migrations. Domain guard is a `before insert` trigger on `auth.users`. Index `orders(slot_id, status)`, `orders(student_id, created_at desc)`, `orders(status, created_at)`. RLS: students read own orders/items/subscriptions; staff/admin read all orders/items; `menu_items` and `slots` readable by any authenticated user, writable by admin only; `profiles` readable by self and admin; **no direct insert/update/delete on profiles, orders, order_items, slots.booked_count** — all writes go through RPCs. Enable Realtime publication on `orders` and `slots`.
- [ ] **Step 4:** `scripts/create-admin.ts <login-id> <password> <full-name>`: using the service-role key, creates the auth user `<login-id>@staff.oac.local` with `app_metadata.provisioned = true`, confirmed email, and a `profiles` row with `role = 'admin'`. Re-running with an existing ID resets the password.
- [ ] **Step 5: Run** `supabase db reset && supabase test db` — expect PASS.
- [ ] **Step 6: Commit** `feat(db): schema, RLS, college email guard`

### Task 3: place_order and cancel_order

**Files:**
- Create: `supabase/migrations/0003_order_rpcs.sql`, `src/lib/orders/types.ts`, `src/lib/orders/actions.ts` (`placeOrder`, `cancelOrder`)
- Test: `tests/integration/place-order.test.ts` (Vitest, local Supabase, service-role client plus per-user clients)

**Interfaces:**
- Produces SQL: `place_order(p_slot_id uuid, p_items jsonb /* [{menu_item_id, qty}] */, p_request_id uuid) returns orders`; `cancel_order(p_order_id uuid) returns orders`. Errors raised with message exactly one of `SLOT_FULL`, `SLOT_CLOSED`, `DEFAULTER`, `ITEM_UNAVAILABLE`, `EMPTY_ORDER`, `NOT_CANCELLABLE`.
- Produces TS: `type PlaceOrderError = 'SLOT_FULL'|'SLOT_CLOSED'|'DEFAULTER'|'ITEM_UNAVAILABLE'|'EMPTY_ORDER'`; `placeOrder(input: {slotId: string; items: {menuItemId: string; qty: number}[]; requestId: string}): Promise<{ok: true; order: Order} | {ok: false; error: PlaceOrderError}>`; `cancelOrder(orderId: string): Promise<{ok: boolean}>`. Order code format `OAC-` + 5 chars from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, generated in SQL with collision retry.

- [ ] **Step 1: Write failing tests** (names and assertions):
  - `places an order and computes total from DB prices` — client sends tampered price in payload, stored `total_paise` equals sum of `menu_items.price_paise * qty`.
  - `last seat race: 25 parallel place_order calls on a capacity-5 slot yield exactly 5 successes and 20 SLOT_FULL; slots.booked_count = 5` (**Review Focus 1**).
  - `same p_request_id twice returns the same order and books one seat` (**Review Focus 2**).
  - `unavailable or deleted item returns ITEM_UNAVAILABLE and books no seat`; `item repriced after cart built uses the new price` (**Review Focus 3**).
  - `SLOT_CLOSED when starts_at - now() < order_cutoff_minutes` (use slots seeded relative to `now()`); past slot also `SLOT_CLOSED` (**Review Focus 4**: server time decides).
  - `defaulter gets DEFAULTER`; `empty items gets EMPTY_ORDER`; `qty <= 0 rejected`.
  - `cancel_order frees the seat and sets cancelled while placed; returns NOT_CANCELLABLE once accepted; other student cannot cancel`.
- [ ] **Step 2: Run** `npx vitest run tests/integration/place-order.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `place_order` as a single transaction: idempotency lookup on `(auth.uid(), p_request_id)` first; check defaulter; lock-free capacity claim via `update slots set booked_count = booked_count + 1 where id = p_slot_id and booked_count < capacity and starts_at > now() + cutoff returning ...` (distinguish `SLOT_FULL` vs `SLOT_CLOSED` by a follow-up read); load items with current price and availability; insert order and snapshot rows in `order_items`. All functions `security definer` with `search_path` pinned and `auth.uid()` checks.
- [ ] **Step 4: Implement** TS server actions mapping RPC error messages to `PlaceOrderError`.
- [ ] **Step 5: Run** tests — expect PASS. Run the race test 10 times for flakiness.
- [ ] **Step 6: Commit** `feat(orders): atomic place_order and cancel_order`

### Task 4: Staff lifecycle RPCs and defaulter rules

**Files:**
- Create: `supabase/migrations/0004_lifecycle_rpcs.sql`, extend `src/lib/orders/actions.ts`
- Test: `tests/integration/lifecycle.test.ts`

**Interfaces:**
- Produces SQL (all staff/admin only, each returns `orders`): `accept_order(p_order_id)` (placed→accepted), `mark_ready(p_order_id)` (accepted→ready), `collect_order(p_order_id)` (ready→collected, or no_show→collected; sets `collected_at`, `paid_at`), `flag_no_show(p_order_id)` (ready→no_show only when `now() >= slot.starts_at + no_show_hold_minutes`; sets `flagged_at`, `profiles.is_defaulter = true`), `settle_no_show(p_order_id)` (admin: sets `paid_at` on a no_show order without collection).
- Rule: after `collect_order` on a no_show order or `settle_no_show`, `is_defaulter = exists(no_show order for that student with paid_at is null)`.
- Produces TS: `acceptOrder`, `markReady` (also calls `sendPushToUser` once Task 10 exists — stub import now), `collectOrder`, `flagNoShow`, each `(orderId: string) => Promise<{ok: true; order: Order} | {ok: false; error: string}>`.

- [ ] **Step 1: Write failing tests:** `student cannot call accept_order`; `illegal transitions rejected (placed→ready, collected→accepted)`; `flag_no_show before 15 minutes after slot start is rejected, after 15 minutes sets is_defaulter`; `flagged student gets DEFAULTER from place_order`; `collect_order on a no_show order clears is_defaulter when it was the only unpaid one`; `two unpaid no_shows: settling one leaves is_defaulter true`; `settle_no_show by admin clears; by staff is rejected`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the RPCs with explicit allowed-transition checks and `for update` row locks.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(orders): staff lifecycle and defaulter rules`

### Task 5: Auth, onboarding, role routing

**Files:**
- Create: `src/lib/supabase/{browser,server,admin}.ts`, `src/app/(auth)/login/page.tsx`, `verify/page.tsx`, `onboarding/page.tsx`, `src/app/(auth)/staff-login/page.tsx`, `src/app/(auth)/change-password/page.tsx`, `supabase/migrations/0005_profile_rpc.sql` (`complete_profile`), route protection (Next.js middleware/proxy per current Next version), `src/lib/auth/redirects.ts`
- Test: `src/lib/auth/redirects.test.ts`, `tests/e2e/auth.spec.ts`

**Interfaces:**
- Produces: `complete_profile(p_full_name text, p_phone text, p_reg_no text) returns profiles` (always creates role `student`; rejects duplicate `reg_no` with `REG_NO_TAKEN`; rejects callers that already have a profile). `homeFor(role: UserRole | null, hasProfile: boolean, mustChangePassword = false, isActive = true): string` → `/login`, `/onboarding`, `/` (student), `/staff`, `/admin`, `/change-password`, `/login?inactive=1`. `staffLogin(loginId: string, password: string): Promise<{ok: boolean}>` signs in as `<loginId>@staff.oac.local`. `changePassword(newPassword: string): Promise<{ok: boolean}>` clears `must_change_password`.

- [ ] **Step 1: Write failing tests:** `homeFor(null,false)==='/login'`, `homeFor('student',false)==='/onboarding'`, `homeFor('student',true)==='/'`, `homeFor('staff',true)==='/staff'`, `homeFor('admin',true)==='/admin'`, `homeFor('staff',true,true)==='/change-password'`, `homeFor('staff',true,false,false)==='/login?inactive=1'`; e2e: staff-login with a valid ID and password lands on `/staff`; a deactivated staff account is refused; a student cannot reach staff-login's role by signing up with any metadata; a staff member with a temporary password is forced to `/change-password` first; non-college email shows a clear error before any code is sent; duplicate registration number shows `REG_NO_TAKEN` message; student visiting `/staff` or `/admin` is redirected home; phone must be a 10-digit Indian mobile number.
- [ ] **Step 2: Run** unit test — expect FAIL; implement `redirects.ts`; run — expect PASS.
- [ ] **Step 3: Implement** student email OTP login (`signInWithOtp`), client-side domain check mirroring the DB guard, verify screen with code input and resend cooldown, onboarding form (name, phone, reg no) with inline validation, a separate staff-login screen (login ID + password) linked quietly from the student login, change-password screen, and route protection by role that also enforces `is_active` and `must_change_password`.
- [ ] **Step 4: Run** `npx playwright test tests/e2e/auth.spec.ts` (mobile viewport) — expect PASS. Use Supabase local Inbucket to read OTP codes in tests.
- [ ] **Step 5: Commit** `feat(auth): OTP login, onboarding, role routing`

### Task 6: Student ordering flow

**Files:**
- Create: `src/app/(student)/page.tsx` (menu), `checkout/page.tsx`, `src/components/{MenuList,CartSheet,SlotPicker}.tsx`, `src/lib/cart.ts`
- Test: `src/lib/cart.test.ts`, `tests/e2e/order.spec.ts`

**Interfaces:**
- Consumes: `placeOrder`, `formatPaise`, `formatSlotTime`.
- Produces: `cart.ts` exports `addItem(cart, itemId)`, `removeItem`, `setQty`, `cartTotalPaise(cart, menu)` (pure), cart persisted in `localStorage` with try/catch fallback; `crypto.randomUUID()` request id created once per checkout attempt and reused on retry.

- [ ] **Step 1: Write failing tests:** cart math (add/remove/set qty to 0 removes line; total uses current menu prices); e2e: student sees menu, adds items, sees only open slots with remaining seats, full slot shown disabled with label "Full", places order and lands on tracking page; defaulter sees a blocking "Clear your dues at the counter" screen with no checkout; double-tapping the button creates one order (**Review Focus 2**); if the server returns `ITEM_UNAVAILABLE` the cart highlights the item.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** menu (grouped by category, sold-out items visibly disabled), cart sheet, slot picker listing today's slots from the DB with remaining seats via Realtime refresh on `slots`; slot times formatted in campus time (**Review Focus 4**); loading, empty ("No slots left today"), and error states designed, not default.
- [ ] **Step 4: Run** unit + e2e — expect PASS.
- [ ] **Step 5: Commit** `feat(student): menu, cart, slot picker, checkout`

### Task 7: Student order tracking and history

**Files:**
- Create: `src/app/(student)/orders/page.tsx`, `orders/[code]/page.tsx`, `src/components/{OrderStatusTimeline,OrderCode}.tsx`, `src/lib/useOrderRealtime.ts`
- Test: `tests/e2e/tracking.spec.ts`

**Interfaces:**
- Produces: `useOrderRealtime(orderId: string): Order` subscribes to Realtime and also refetches on `visibilitychange` and `online` events.

- [ ] **Step 1: Write failing e2e tests:** order page shows the order ID large and readable in mono, slot time, items, total "pay at counter", status timeline; staff marking ready (via service-role RPC in the test) updates the page without reload; **after simulating a background/foreground cycle with Realtime disconnected, the page still shows Ready** (**Review Focus 5**); student can cancel while `placed` but the button is gone once `accepted`; `no_show` shows an "unpaid — pay at the counter" message.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** tracking page, history list, `useOrderRealtime` with refetch fallback.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(student): live order tracking and history`

### Task 8: Staff counter console

**Files:**
- Create: `src/app/staff/page.tsx`, `src/components/staff/{OrderCard,SlotGroup,CodeLookup,HoldTimer}.tsx`, `src/lib/staff/groupBySlot.ts`
- Test: `src/lib/staff/groupBySlot.test.ts`, `tests/e2e/staff.spec.ts`

**Interfaces:**
- Consumes: `staff_orders_v`, `acceptOrder`, `markReady`, `collectOrder`, `flagNoShow`.
- Produces: `groupBySlot(orders: StaffOrder[]): {slotStart: string; orders: StaffOrder[]}[]` sorted by slot time then `created_at`, excluding `collected`/`cancelled`.

- [ ] **Step 1: Write failing tests:** `groupBySlot` sorts and groups correctly and drops finished orders; e2e at phone viewport: new order appears live, with a vibration and a short sound on arrival; one-tap Accept → Ready → Collected from the card with thumb-reach bottom actions; `CodeLookup` finds an order by typing the last characters of the code and ignores case and `0/O`-style confusion by only using the unambiguous alphabet; "Flag no-show" is disabled with a countdown until 15 minutes after slot start, then enabled; actions are optimistic with rollback on failure and an offline banner.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the console. Subscribe to Realtime on `orders`, refetch `staff_orders_v` on change, poll every 15 s as a fallback. Show a prep summary per slot ("12 × Samosa") to help batch cooking.
- [ ] **Step 4: Run** unit + e2e — expect PASS.
- [ ] **Step 5: Commit** `feat(staff): live counter console`

### Task 9: Admin console

**Files:**
- Create: `supabase/migrations/0006_admin_rpcs.sql`, `src/app/admin/{menu,slots,defaulters,staff}/page.tsx`, server actions in `src/lib/admin/actions.ts`
- Test: `tests/integration/admin.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Produces SQL: `generate_slots(p_day date, p_from time, p_to time, p_minutes int, p_capacity int) returns int` (campus-timezone, idempotent via `on conflict (starts_at) do nothing`, returns rows created); `set_slot_capacity(p_slot_id uuid, p_capacity int)` (rejects below `booked_count`). Menu CRUD through RLS admin policies. Server actions (admin-only, using the service-role client after verifying the caller is an admin): `createStaff(input: {loginId: string; fullName: string}): Promise<{ok: true; loginId: string; temporaryPassword: string} | {ok: false; error: 'ID_TAKEN'|'INVALID_ID'}>` (generates a random temporary password shown once, creates the user with `app_metadata.provisioned = true`, `role = 'staff'`, `must_change_password = true`), `resetStaffPassword(staffId: string): Promise<{temporaryPassword: string}>`, `setStaffActive(staffId: string, active: boolean): Promise<{ok: boolean}>` (deactivating also signs the user out).

- [ ] **Step 1: Write failing tests:** `generate_slots creates 1:00–2:00 PM IST in 10-min slots and is idempotent`; `set_slot_capacity below booked_count is rejected`; non-admin calls rejected; e2e: admin adds item, toggles sold out (student menu reflects it live), creates slots, opens defaulters list showing name, phone, registration number, unpaid amount, and "Mark paid" clears the flag so the student can order again; admin creates a staff login and sees the temporary password once, that staff member can sign in and is forced to change it, reset gives a new temporary password, and deactivating blocks the next request; a staff user cannot open `/admin` or call the staff-management actions.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** RPCs and the three pages with the shared design primitives.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(admin): menu, slots, defaulters`

### Task 10: PWA, push notifications, offline

**Files:**
- Create: `public/manifest.webmanifest`, `public/icons/*` (192, 512, maskable), `public/sw.js`, `src/components/{InstallPrompt,PushOptIn}.tsx`, `src/app/api/push/subscribe/route.ts`, `src/lib/push/send.ts`, `src/app/offline/page.tsx`
- Test: `tests/integration/push.test.ts`, `tests/e2e/pwa.spec.ts`

**Interfaces:**
- Produces: `sendPushToUser(userId: string, payload: {title: string; body: string; url: string}): Promise<void>` using VAPID keys from env; removes subscriptions that return 404/410; never throws (a failed push must not fail `markReady`). `POST /api/push/subscribe` stores a `PushSubscriptionJSON` for the signed-in user.

- [ ] **Step 1: Write failing tests:** `sendPushToUser` with a mocked `web-push` deletes a subscription on 410 and swallows other errors; `markReady` still succeeds when push throws; e2e: manifest is valid and linked, service worker registers, `/offline` is served when the network is down, push prompt appears only after the first order is placed (never on first load), and iPhone user agents see "Add to Home Screen to get ready alerts" guidance instead of a broken permission button (**Review Focus 5**).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** manifest (standalone, theme color from design tokens), service worker (cache static shell, offline fallback, `push` and `notificationclick` handlers that open the order page), opt-in UI, subscribe route, and wire `sendPushToUser` into `markReady` with copy "Your order OAC-XXXXX is ready — show this ID at the counter." Generate VAPID keys and document them in `.env.example`.
- [ ] **Step 4: Run** tests — expect PASS. Manually verify on a real Android phone and an installed iPhone PWA.
- [ ] **Step 5: Commit** `feat(pwa): installable app and ready notifications`

### Task 11: Load test, accessibility, deploy

**Files:**
- Create: `scripts/load-test.ts`, `tests/e2e/a11y.spec.ts`, `README.md` (setup, env, roles, deployment)

- [ ] **Step 1: Write the load script:** seed 300 test students and 30 slots of capacity 15; fire 600 `place_order` calls in 30 seconds with realistic mixes; assert zero overbooking (`booked_count <= capacity` everywhere and `count(orders) per slot` equals `booked_count`) and report p95 latency. Target: p95 under 800 ms on the chosen Supabase tier; if missed, tune indexes or connection pooling before launch.
- [ ] **Step 2: Write a11y tests:** run axe on login, menu, checkout, order tracking, staff, and admin pages at phone viewport; expect zero serious/critical violations; verify keyboard focus order and 4.5:1 contrast on the status colors.
- [ ] **Step 3: Run** both, fix findings, re-run until passing.
- [ ] **Step 4: Visual polish pass** at 360 px and 390 px widths: check every state (loading, empty, error, full slot, offline, defaulter-blocked) against the design foundation; remove anything that reads as template-default.
- [ ] **Step 5: Deploy:** Vercel for the app and a production Supabase project (run migrations, set env vars, set auth email templates and a custom SMTP sender so OTP emails to 2500 students are not rate-limited, set `COLLEGE_EMAIL_DOMAIN`). Create the admin with `scripts/create-admin.ts` and hand the credentials over directly. Smoke test the full flow on a real phone.
- [ ] **Step 6: Commit** `chore: load test, a11y checks, deployment docs`

---

## Self-Review Notes

- **Spec coverage:** accounts and verification (T2, T5); slots with capped capacity and cutoff (T2, T3, T9); core student flow with unique ID (T3, T6, T7); staff phone-first processing (T8); ready notification (T10); counter payment only (no gateway anywhere); 15-minute hold, defaulter flag, blocking, late-arrival clearing, admin defaulter details (T4, T6, T9); PWA (T10); scale and no overbooking (T3, T11); design quality bar (T1, T11).
- **Type consistency:** RPC and TS names (`place_order`/`placeOrder`, `mark_ready`/`markReady`, `PlaceOrderError`, `staff_orders_v`, `NO_SHOW_HOLD_MINUTES`) are used identically across tasks.
- **Dependencies:** Tasks run in order. T1 and T2 can start in parallel; T6–T9 depend on T3–T5; T10 hooks into `markReady` from T4.
