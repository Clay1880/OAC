# Campus Food Platform — from OAC pre-order to a multi-canteen, personalised portal

Date: 2026-10-17. Status: draft for discussion. Written after a full read of the `feat/oac-preorder` branch (committed work plus the uncommitted JavaGem redesign).

---

## 0. The short answer

**Extend this project. Do not start a new one.**

What you have is not "a food ordering app". It is a hardened ordering *engine*: atomic slot booking that cannot overbook under load, role-gated Postgres RPCs, RLS that students cannot bypass, a live staff console, PWA + Web Push, and a real test suite (unit, DB integration, pgTAP, Playwright). That is the 60–70% of this product that is hard and boring. A rewrite throws it away and you would rebuild the same thing, with new bugs, before getting to the part that is actually new.

What is missing is two layers on top:

1. **Tenancy** — colleges → canteens → their own menus, slots, staff and orders. Today everything is hard-wired to one canteen ("AIT Pune canteen", one `app_settings` row, one global `menu_items`, one global `slots`).
2. **Personalisation + AI** — a profile that knows the student (diet, budget, taste, timetable), a "meal moment" engine (breakfast/lunch/snack/dinner by campus time), and a Gemini-backed assistant that recommends and can act (add to cart, pick a slot), always grounded in what is actually on sale right now.

Those two layers are a planned refactor plus new feature work, not a rewrite. Section 5 says exactly how.

The only reason to start fresh would be a different platform choice (native mobile apps, a different backend). You did not ask for that, and the PWA choice still fits a college audience.

---

## 1. What exists today (inventory)

### 1.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 16.4 (App Router, Turbopack), React 19.3, TypeScript | AGENTS.md warns this Next.js differs from training data; read `node_modules/next/dist/docs/` before coding |
| Styling | Tailwind CSS 4 with a fully custom token set (`globals.css`), Sora + JetBrains Mono | Stock palette removed; JavaGem copper/charcoal theme from Figma (uncommitted) |
| Backend | Supabase: Postgres, Auth (OTP email + password for staff), Realtime, RLS | All business writes go through `security definer` RPCs |
| Notifications | Web Push via `web-push`, VAPID keys | Service worker at `public/sw.js` |
| PWA | `manifest.ts`, offline page, install prompt | |
| Tests | Vitest (unit + DB integration against local Supabase), pgTAP (`supabase/tests/schema.test.sql`), Playwright e2e with axe | Last Playwright run: passed |
| Tooling | Supabase CLI local stack, `scripts/seed-demo.ts`, `scripts/create-admin.ts`, Wikimedia food-photo pipeline | |

### 1.2 Data model (7 migrations)

```
app_settings (single row: cutoff mins, no-show hold mins, college_email_domain)
profiles     (id → auth.users, full_name, phone, reg_no, role student|staff|admin,
              is_defaulter, is_active, must_change_password)
menu_items   (name, description, price_paise, category, is_available, sort)   ← no canteen
slots        (starts_at UNIQUE, capacity, booked_count)                        ← no canteen
orders       (code 'OAC-XXXXX', student_id, slot_id, status, total_paise,
              request_id for idempotency, timestamps)                          ← no canteen
order_items  (snapshot of name + unit price)
push_subscriptions
staff_orders_v (security-definer view, gated by current_role())
```

RPCs: `place_order` (idempotent, lock-free capacity claim, server-side pricing), `cancel_order`, `accept_order`, `mark_ready`, `collect_order`, `flag_no_show`, `settle_no_show`, `complete_profile`, `generate_slots`, `set_slot_capacity`, `upsert_push_subscription`.

Auth guard: a trigger on `auth.users` rejects any sign-up not on the single `college_email_domain`; staff logins live on a synthetic `@staff.oac.local` domain and must be provisioned by an admin.

### 1.3 Screens

- **Student**: home/menu with search + category chips, cart sheet, checkout with an AM/PM clock pickup picker, order tracker (realtime), order history, dues block when flagged as a defaulter, push opt-in, install prompt.
- **Staff** (phone-first): live console grouped by slot, accept → ready → collected, order-code lookup, hold timer, sound/vibration on new orders.
- **Admin**: menu CRUD + sold-out toggle, slot generation and capacity, defaulters with "mark paid", staff accounts (create, reset password, deactivate).
- **Auth**: OTP email login, onboarding (name, phone, reg no), staff login, forced password change, demo login (env-gated).

### 1.4 Health and loose ends

- 52 files are modified and 12 untracked on `feat/oac-preorder`: the JavaGem redesign, food photos, bottom nav, brand mark, real 62-item menu seed. This is **not committed**. Commit it (or stash it) before any of the work below starts, otherwise the tenancy refactor will collide with it.
- Deferred minors from the SDD ledger worth carrying: no index on `order_items(menu_item_id)`; pgTAP tests need a fresh `db reset`; admin slot list capped at 300 with no date filter; no search on staff/defaulter lists.
- `menuImage.ts` only maps coffee names to photos; the food-photo pipeline (`scripts/build-food-images.mjs`, `public/food/`) exists but the menu has no `image_url` column yet.
- The spec's explicit non-goals were "online payments, delivery, multiple canteens". The new vision reverses the third one, so the spec is superseded by this document.

---

## 2. The vision, restated

A college-wide food portal where:

- **Every canteen and food stall** on a campus registers, lists its own menu, opens its own pickup slots, and runs its own counter console with its own staff.
- **Students** sign in once with their college email, see every canteen on their campus, and get a feed that is *theirs*: what fits the time of day, their mood, their diet, their budget, their timetable, and what they have liked before.
- **An AI assistant** (Gemini) that does not just chat but recommends *from the live menu*, explains why, and can build the order and pick the slot for you.
- Later: **more colleges** on the same deployment, each isolated.

The bar you set earlier still stands: not vibe-coded, phone-first, polished states, atomic bookings under a 1 pm rush.

---

## 3. Gap analysis

| Area | Today | Needed | Effort |
|---|---|---|---|
| Colleges | one, implicit (`app_settings.college_email_domain`) | `colleges` table, many email domains, campus timezone, per-college settings | M |
| Canteens | none (hard-coded "AIT Pune canteen") | `canteens` table, registration + approval flow, opening hours, meal windows, logo, location | M |
| Menu | one global table | `canteen_id` on items, tags (veg/non-veg/egg/jain/vegan, spice, allergens), `image_url`, meal-window hints, prep minutes | M |
| Slots | one global table | `canteen_id` on slots; capacity per canteen; `UNIQUE(canteen_id, starts_at)` | S (schema) / M (RPC + UI) |
| Orders | one canteen | `canteen_id`; order code prefix per canteen; cart that is per-canteen (or multi-canteen split, see §7) | M |
| Roles | student / staff / admin, global | student, `canteen_staff`, `canteen_owner`, `college_admin`, `platform_admin` via a membership table | M |
| RLS / RPCs | role checks only | role **and** canteen membership checks in every policy and RPC | L (touches everything, must be done once, carefully) |
| Staff console | one | scoped to the staff member's canteen | S |
| Admin | one global console | split into college admin (approve canteens, domains, defaulters campus-wide) and canteen owner (menu, slots, staff, hours) | M |
| Student profile | name, phone, reg no | + diet, allergens, budget, favourite cuisines, spice tolerance, optional timetable, mood history | M |
| Personalisation | none | meal-moment engine, ranking, "for you" feed, taste memory | M |
| AI assistant | none | Gemini server route, grounded recommendation, tool-calling chat, rate limits, caching, fallbacks | L |
| Discovery | none | canteen list with live wait estimate, "open now", search across canteens | M |
| Payments | counter only | keep counter-pay as default; UPI later (decision needed, §9) | — |

S = days, M = about a week, L = one to two weeks of focused work.

---

## 4. Target architecture

### 4.1 Tenancy model

```
colleges ──< college_domains        (one college, many email domains)
colleges ──< canteens ──< menu_items
                      ──< slots
                      ──< orders ──< order_items
                      ──< canteen_members (user_id, canteen_id, role owner|staff)
colleges ──< profiles (every user belongs to exactly one college)
```

- A **student's college** is derived from their email domain at sign-up (the existing trigger generalises to "domain exists in `college_domains`").
- **Canteen staff and owners** are still provisioned (not self-registered) but by the canteen owner, not a global admin. The synthetic `@staff.oac.local` domain becomes `@staff.<platform>.local`.
- **Canteen registration**: a canteen owner fills a public form (name, college, description, hours, contact). A college admin approves it. Until approved, the canteen is invisible to students. Approval creates the owner's login.
- **platform_admin** is one or two people (you) who create colleges and college admins. No UI needed at first; a script like `create-admin.ts` is enough.

### 4.2 Authorisation rule, stated once

Every table with `canteen_id` gets the same shape of policy:

- Students read what is public (`is_available`, approved canteens, their own orders).
- Canteen staff/owner read and write rows where `canteen_id` is in their memberships.
- College admins read everything in their college; write only approvals, domains, defaulters.
- All order-state changes stay in RPCs; each RPC's first statement checks membership for that order's `canteen_id`.

Write this as one helper (`public.is_canteen_member(canteen_id, min_role)`) and use it everywhere, like `current_role()` is used today.

### 4.3 What stays exactly as it is

The parts you should not touch except to add a `canteen_id` parameter: `place_order`'s idempotency + capacity claim, the order lifecycle RPCs, the defaulter recomputation, push delivery, the cart store, the realtime hooks, the slot maths in `slots.ts`, the design tokens.

### 4.4 Personalisation engine (deterministic, no AI needed)

Lives in Postgres + a small TypeScript module. Input: the student, the campus clock, the live menu. Output: a ranked candidate list with reasons. This runs on every home-screen load and costs nothing.

Signals, in priority order:

1. **Meal moment**: breakfast / lunch / snack / dinner / late-night, computed from campus time and the college's configured windows (AIT's break is 1:00–1:45 pm; that is a *lunch* window). Each menu item carries which moments it suits.
2. **Hard filters**: diet (veg-only hides non-veg; Jain hides onion/garlic items), allergens, "open now", "available now", within budget if a budget is set.
3. **Taste memory**: items the student reordered, thumbs-up/down after pickup, categories they never touch.
4. **Context**: a timetable entry ending at 12:55 means suggest a 1:05–1:15 slot; cold morning → hot drinks nudge; Friday evening → "treat yourself".
5. **Canteen load**: `booked_count / capacity` of the next slots, turned into "about 5 min wait" vs "busy, try the stall near the library".

This engine produces the **"For you right now"** section on home. It is also the *only* thing the AI is allowed to recommend from.

### 4.5 AI assistant (Gemini)

**Principle: Postgres decides what exists; Gemini decides what to say.** The model never invents a dish, a price, or a slot. It receives a candidate list with IDs and returns IDs.

Pieces:

- **SDK**: `@google/genai` (the current Google Gen AI JS SDK). The older `@google/generative-ai` package is deprecated; do not use it. Key in `GEMINI_API_KEY`, server only, never `NEXT_PUBLIC_`.
- **Model**: the current Flash-tier model (`gemini-flash-latest` alias, or pin the exact model id at build time). Fast and cheap enough for per-student calls. Keep the model id in an env var so it can be swapped without a deploy.
- **Two call types**:
  1. *Suggest* (one shot): input = student profile summary + mood chips/free text + meal moment + up to ~30 candidate items (id, name, tags, price, canteen, wait). Output = structured JSON via `responseMimeType: "application/json"` + `responseJsonSchema` (ids, a one-line reason per pick, a combo suggestion, estimated spend). Used for the home "For you" card and the mood prompt.
  2. *Chat* (multi-turn): `ai.chats` with function declarations: `search_menu(query, filters)`, `get_candidates(mood)`, `add_to_cart(item_id, qty)`, `get_open_slots(canteen_id)`, `choose_slot(slot_id)`, `get_my_orders()`. The server executes every function against Supabase as the signed-in user (so RLS still applies) and returns results to the model. The model can say "Added 2 samosas and a chai from the main canteen, pickup 1:10 pm. Place it?" and the student confirms with a real button, not through the model. Placing the order is never a model-invoked function.
- **Mood input**: a row of chips (tired, stressed, hungry-hungry, light, treat, quick, cold day) plus a free-text box. Chips are logged as structured data; free text goes to the model. This gives useful analytics even when the model is off.
- **Hinglish / Marathi**: Gemini handles mixed-language input natively; set a system instruction to reply in the language the student used.
- **Guardrails**: system instruction limits the assistant to food on this campus; refuse anything else politely. Reject student messages over ~500 chars. Strip the model output to the JSON schema; anything else is dropped.
- **Cost and abuse control**: rate limit per user (e.g. 20 assistant calls / hour, stored in a `assistant_calls` table or Upstash), cache *suggest* results per (user, meal moment, mood, menu version) for 10 minutes, and log every call (tokens, latency) so you can see the bill.
- **Fallback**: if the key is unset, the quota is hit, or the call fails or times out (3 s), show the deterministic engine's picks with template reasons ("Popular at lunch", "You ordered this twice"). The student should never see an error from the assistant.
- **Privacy**: send the model a *summary* (diet, budget band, top liked categories, mood), never name, phone, reg no, or raw order history.

### 4.6 Canteen-side intelligence (phase 3, cheap wins)

- **Prep forecast**: orders per slot in the next 30 min, grouped by item, already exists for staff; add "expected" from the last 2 weeks' same weekday.
- **Auto "running low"**: owner sets a daily quantity; the counter decrements; the item flips to sold out at zero.
- **Menu helper**: Gemini writes a description and suggests tags from an item name and a photo. One-click, editable, cheap.

---

## 5. Migration plan (extend, in order)

Each phase ends green: `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`.

### Phase 0 — Land the current work (1 day)
- Commit the JavaGem redesign and the real menu seed on `feat/oac-preorder`. Merge to `main`.
- Tag it `v0-single-canteen` so the demo version is always recoverable.
- Branch `feat/platform-tenancy` from `main`.

### Phase 1 — Tenancy schema and auth (1 week)
- Migration `0008_tenancy.sql`: `colleges`, `college_domains`, `canteens` (with `status pending|approved|suspended`, hours, `meal_windows jsonb`, `code_prefix`), `canteen_members`; add `college_id` to `profiles`, `canteen_id` to `menu_items`, `slots`, `orders`; `UNIQUE(canteen_id, starts_at)` on slots; backfill: create college "AIT Pune" + canteen "OAC", point every existing row at it.
- Generalise `enforce_college_email()` to look up `college_domains`; set `profiles.college_id` in `complete_profile`.
- Add `is_canteen_member()`; rewrite every policy and RPC to take/derive `canteen_id`. `place_order` gets `p_canteen_id` and verifies every item belongs to it and the slot belongs to it.
- Order code: `<prefix>-XXXXX` from `canteens.code_prefix`.
- Tests: extend `tests/integration/*` with a second canteen and prove cross-canteen reads and writes fail; pgTAP for the new constraints.

### Phase 2 — Multi-canteen student experience (1 week)
- New home: **campus feed** — canteen cards (open now, wait estimate, top 3 items), then the existing menu screen per canteen under `/c/[canteenSlug]`.
- Cart becomes per-canteen (one active canteen at a time; switching asks to clear). Simplest correct model; see §7 for the split-order alternative.
- Checkout and tracker unchanged apart from the canteen name and prefix.
- Search across canteens.

### Phase 3 — Canteen onboarding and consoles (1 week)
- Public `/register-canteen` form → `canteens` row in `pending`.
- College admin console: approve/suspend canteens, manage domains, campus-wide defaulters.
- Canteen owner console = today's admin console scoped to one canteen, plus hours/meal windows/logo. Staff console scoped by membership.
- Script to create a college and its first admin.

### Phase 4 — Profile and personalisation (1 week)
- Migration `0009_personalisation.sql`: `profiles` gains `diet`, `allergens text[]`, `budget_paise_per_meal`, `spice`; `menu_items` gains `tags text[]`, `meal_moments text[]`, `image_url`, `prep_minutes`; new `item_feedback` (user, item, thumbs, created_at), `timetable_entries` (optional), `mood_logs`.
- Deterministic engine (`src/lib/personalise/`) with unit tests: meal moment from campus time, filters, scoring, reasons.
- Home gets "For you right now" and a mood chip row. Post-pickup "How was it?" thumbs on the order page.
- Tag the existing 62 items (veg/non-veg/egg, moment) in the seed.

### Phase 5 — Gemini assistant (1–2 weeks)
- `src/lib/ai/` with `suggest()` and `chat()`; route handlers under `/api/assistant/*` (edge-unsafe: Node runtime, server key).
- Structured-output schema, function declarations, the rate limiter, the cache, the log table, the 3 s timeout and fallback.
- Assistant sheet UI: chips, text box, streamed reply, "Added to cart" cards with a real Place order button.
- Tests: unit-test the prompt builder and the JSON parsing against recorded responses; integration-test that function execution respects RLS; e2e with the key unset proves the fallback.

### Phase 6 — Hardening for many canteens (ongoing)
- Load test `place_order` across 5 canteens × 300 students.
- Indexes on every `canteen_id` column and `order_items(menu_item_id)`.
- Observability: Supabase logs + a tiny `/admin/health` page (orders/min, assistant spend).
- Deploy: Vercel + hosted Supabase; enable email confirmations, paste the OTP template, set `college_domains`.

---

## 6. Innovation checklist — what makes this "not just another ordering app"

Pick the ones you want; each is scoped so it can be a phase-4/5 task.

1. **Meal-moment home** that changes with the campus clock and the college's own break timetable, not the wall clock.
2. **Mood → food** with an explained pick ("Stressed before a viva? Something warm and quick: masala maggi from OAC, ready by 12:50").
3. **Timetable-aware pickup**: upload or type your timetable once; the slot picker preselects the first slot after your class ends.
4. **Live wait across canteens**: "OAC is slammed (12 min). The stall near Block C is 3 min." Computed from slot fill, no AI needed.
5. **Budget mode**: set a monthly canteen budget; the feed respects it; a spend bar on the orders page.
6. **Taste memory**: thumbs after pickup; reorder in one tap; "your usual" at the top at your usual time.
7. **Diet modes**: veg-only / Jain / egg-ok / allergen hide, enforced in the deterministic engine so the model cannot slip.
8. **Group order** (later): one student opens a group link, friends add items, one pickup code, each pays their part at the counter (needs per-line "paid by" bookkeeping).
9. **Canteen daily special** push: owners post a special; students who like that category get a push at the right meal moment.
10. **Owner AI helper**: description + tags from a photo; demand hint per slot.
11. **Hinglish assistant** that works by voice on the phone (Web Speech API → text → Gemini).
12. **Night mess / hostel** support via meal windows that cross midnight (the campus-day maths in `slots.ts` needs a small change for that).

Anti-innovation (things that would make it generic): a chat bubble that only answers questions, recommendations not grounded in live availability, Swiggy-style promos and banners, ratings without the pickup context.

---

## 7. Decisions I made (override any of them)

- **One canteen per order.** Multi-canteen carts split into N orders with N codes and N pickups; it is confusing at a counter. Keep the cart per canteen; the assistant can suggest "that drink is at another stall" but builds one order at a time.
- **Pay at counter stays the default.** Every canteen already works that way, and the defaulter mechanism replaces payment risk. UPI can be added per canteen later without touching the ordering engine (an `orders.payment` field and a `paid_online_at` timestamp).
- **College admin approves canteens**, not platform admin, so the platform scales without you in the loop.
- **Gemini is server-side only, through route handlers**, never from the browser.
- **Mood is explicit** (chips + text), not inferred from behaviour. Inference is creepy and unreliable; chips are honest and give you data.
- **Keep the JavaGem copper theme** as the platform theme; canteens get a logo and an accent colour, not a full theme.
- **Rename the brand** away from "OAC" (that is one canteen's name) once Phase 2 lands. The code prefix per canteen keeps "OAC-" for that canteen.

---

## 8. Environment additions

```
GEMINI_API_KEY=            # server only
GEMINI_MODEL=gemini-flash-latest
ASSISTANT_RATE_LIMIT_PER_HOUR=20
ASSISTANT_CACHE_SECONDS=600
```

`NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN` goes away; domains live in `college_domains`.

---

## 9. Decisions taken (2026-10-17)

Yours:

1. **Order of work: tenancy first** (Phase 1 → 2 → 3), then personalisation and the assistant.
2. **Colleges table from day one, AIT Pune only at launch.** The schema, guard and RLS are college-aware; the UI assumes one college until a second one is created. No college picker, no college onboarding UI in Phase 1–3.
3. **Pay at the counter only, platform-wide.** No payment table, no UPI, no online payment field in any phase of this document. The defaulter mechanism remains the payment safeguard.
4. **The assistant recommends and acts**: it can search, add to the cart and choose a slot through server-executed functions. Placing the order stays a human button press.

Mine (unchanged from §7 unless noted):

- The first non-OAC canteen is a seeded fixture ("Juice Centre") until you name a real one; Phase 2 is tested against it.
- No timetable importer in the first release; timetable entries are typed by hand (a form), importer later if an ERP export exists.
- No demo date is known; phases are ordered for correctness, not for an early demo.

---

## 10. Plans

- Phase 1: `docs/superpowers/plans/2026-10-17-platform-tenancy.md`
- Phases 2–6: one plan each, written when the previous phase has landed on `main`.
