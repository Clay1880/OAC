# AI Canteen Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student opens the home screen, taps a mood, and gets three grounded suggestions for right now (time of day + mood) with a one-tap Add; a chat sheet answers in plain language and can add items to the cart.

**Architecture:** Postgres decides what exists, Gemini decides what to say. Menu items gain `tags` and `meal_moments`; a deterministic engine (`src/lib/assist/`) computes the meal moment from campus time and ranks available items by mood; Gemini (`@google/genai`, structured JSON output) picks and explains from that candidate list only, with the rules engine as the silent fallback when the key is unset, the call fails or times out. Two Node route handlers under `/api/assistant/` do the work server-side; the client applies cart actions.

**Tech Stack:** Next.js 16 route handlers (Node runtime), `@google/genai`, Supabase (RLS as the signed-in student), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-campus-food-platform-design.md` §4.4, §4.5, §9 decision 4.

## Global Constraints

- `GEMINI_API_KEY` is server-only (never `NEXT_PUBLIC_`); model id from `GEMINI_MODEL`, default `gemini-flash-latest`. Both documented in `.env.example`.
- The model never invents a dish, price or slot: it receives candidate ids and returns ids; any id not in the candidate list is dropped.
- The student never sees an assistant error: every failure path returns the rules-engine result with template reasons.
- The model receives no name, phone, registration number or raw order history: only moods, the free-text note (≤300 chars), the meal moment, the canteen name and the candidate list.
- Placing the order stays a human button press; the assistant only adds to the cart.
- Rate limit: 30 assistant calls per user per hour (in-memory per server instance is acceptable for this phase); over the limit returns the rules result, never an error.
- Timeout for any Gemini call: 4000 ms.
- Campus time is `Asia/Kolkata` (`CAMPUS_TZ` in `src/lib/config.ts`). Meal moments: breakfast 06:00–10:59, lunch 11:00–14:59, snack 15:00–18:29, dinner 18:30–22:29, late otherwise.
- Current canteen only: everything is scoped to `studentCanteen()` from `src/lib/tenancy/current.ts`.
- Read `node_modules/next/dist/docs/` before touching route handlers or pages (AGENTS.md).
- Every task ends green: `npm run typecheck && npm run lint && npx vitest run src`. Playwright runs with `PORT=3100`.

## Review Focus

1. **No API key set** (the default on every machine today): the mood sheet still returns three picks with template reasons and no error. Test: Task 2 unit (fallback), Task 3 e2e.
2. **Gemini returns an id that is not a candidate, or malformed JSON**: the pick is dropped or the whole response falls back; nothing invented reaches the screen. Test: Task 2 unit on `parsePicks`.
3. **A sold-out item**: never a candidate, so never suggested even if the model would like it. Test: Task 1 unit.
4. **A note over 300 characters or an unknown mood id**: the route rejects with 400 before any model call. Test: Task 2 unit on `parseSuggestRequest`.
5. **Chat asked for something off-topic** ("write my assignment"): the reply stays on canteen food and adds nothing to the cart. Pinned by the system instruction; the e2e in Task 4 only runs when a key is present, so this is a ⚠️ manual check noted in the task.

---

### Task 1: Tags, meal moments and the rules engine

**Files:**
- Create: `supabase/migrations/0010_menu_tags.sql`, `src/lib/assist/moment.ts`, `src/lib/assist/moment.test.ts`, `src/lib/assist/moods.ts`, `src/lib/assist/engine.ts`, `src/lib/assist/engine.test.ts`
- Modify: `supabase/seed.sql`, `src/lib/menu.ts`

**Interfaces:**
- Produces SQL: `menu_items.tags text[] not null default '{}'`, `menu_items.meal_moments text[] not null default '{}'`. Seed tags every seeded item: diet tag `veg` | `non-veg` | `egg` (exactly one), plus descriptors from `hot | cold | light | heavy | spicy | sweet | quick | filling | drink | snack | meal`; `meal_moments` from `breakfast | lunch | snack | dinner | late` (e.g. Idli Sambhar → `{veg,hot,light,quick}` / `{breakfast,snack}`; Chicken Biryani → `{non-veg,heavy,filling,meal,spicy}` / `{lunch,dinner}`; Tea → `{veg,hot,drink,quick}` / `{breakfast,snack,late}`).
- Produces TS:
  - `MenuItem` gains `tags: string[]; meal_moments: string[]`; `MENU_COLUMNS` gains both.
  - `type MealMoment = "breakfast" | "lunch" | "snack" | "dinner" | "late"`; `mealMoment(nowMs: number): MealMoment` using the Global Constraints windows in `CAMPUS_TZ`; `momentLabel(m: MealMoment): string` ("Breakfast", "Lunch break", "Evening snack", "Dinner", "Late night").
  - `MOODS: readonly { id: MoodId; label: string; wants: string[]; avoids: string[] }[]` with ids `tired | stressed | starving | light | treat | quick | cold`, labels "Tired", "Stressed", "Starving", "Something light", "Treat myself", "In a hurry", "Cold day"; `wants`/`avoids` are tag lists (e.g. tired → wants `hot, drink, quick`; starving → wants `filling, meal`, avoids `light`; light → wants `light`, avoids `heavy`).
  - `type Candidate = { item: MenuItem; score: number; reasons: string[] }`; `rankCandidates(items: MenuItem[], ctx: { moment: MealMoment; moods: MoodId[]; vegOnly: boolean }): Candidate[]` — drops unavailable items and, when `vegOnly`, anything not tagged `veg`; score = 3 per moment match + 2 per wanted tag − 2 per avoided tag; reasons are template strings ("Good for lunch", "Warm and quick", "Light on the stomach"); returns at most 12, highest score first, ties by `sort`.

- [ ] **Step 1: Write failing tests.** `moment.test.ts`: 07:30 IST → breakfast, 13:05 → lunch, 16:00 → snack, 20:00 → dinner, 23:30 and 03:00 → late (build instants from UTC: 13:05 IST = 07:35Z). `engine.test.ts`: unavailable item never returned (Review Focus 3); `vegOnly` drops `non-veg`; lunch + `starving` ranks a `{filling,meal}` lunch item above a `{light}` snack; every candidate has ≥1 reason; at most 12 returned.
- [ ] **Step 2: Run** `npx vitest run src/lib/assist` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** the migration, seed tags, `menu.ts` columns, and the three modules per Interfaces.
- [ ] **Step 4: Run** `npx supabase db reset && npx vitest run src && npm run typecheck && npm run lint` — expect PASS.
- [ ] **Step 5: Commit** `git add supabase src/lib/assist src/lib/menu.ts && git commit -m "feat(assist): menu tags, meal moments and rules engine"`

### Task 2: Gemini suggest route with rules fallback

**Files:**
- Create: `src/lib/assist/gemini.ts`, `src/lib/assist/gemini.test.ts`, `src/lib/assist/suggest.ts`, `src/lib/assist/suggest.test.ts`, `src/lib/assist/rateLimit.ts`, `src/lib/assist/request.ts`, `src/lib/assist/request.test.ts`, `src/app/api/assistant/suggest/route.ts`
- Modify: `package.json` (add `@google/genai`), `.env.example`

**Interfaces:**
- Consumes: `rankCandidates`, `mealMoment`, `MOODS`, `studentCanteen`, `createClient` (server).
- Produces:
  - `type SuggestInput = { canteenName: string; moment: MealMoment; moods: MoodId[]; note: string; candidates: { id: string; name: string; price_paise: number; tags: string[]; category: string }[] }`; `type Pick = { id: string; reason: string }`; `type SuggestResult = { headline: string; picks: Pick[] }`.
  - `parsePicks(raw: unknown, allowedIds: Set<string>): SuggestResult | null` (pure): accepts `{ headline: string, picks: [{ id, reason }] }`, drops picks whose id is not allowed, returns null when the shape is wrong or no pick survives (Review Focus 2).
  - `suggestWithGemini(input: SuggestInput, opts?: { timeoutMs?: number }): Promise<SuggestResult | null>`: returns null immediately when `GEMINI_API_KEY` is unset; otherwise `new GoogleGenAI({ apiKey })`, `ai.models.generateContent({ model, contents, config: { responseMimeType: "application/json", responseJsonSchema: SUGGEST_SCHEMA, systemInstruction: SUGGEST_SYSTEM } })` raced against the timeout; `parsePicks(JSON.parse(response.text), ids)`; any throw → null. `SUGGEST_SYSTEM` says: you are the canteen's assistant; pick up to 3 ids from the candidate list only; one short reason each in the user's language; headline ≤ 60 chars.
  - `suggest(input: SuggestInput, candidates: Candidate[], gemini = suggestWithGemini): Promise<SuggestResult & { source: "gemini" | "rules" }>`: gemini result or the top-3 candidates with their first reason and headline `"${momentLabel} picks for you"`.
  - `rateLimit(key: string, limit = 30, windowMs = 3_600_000): boolean` (true = allowed), module-level Map.
  - `parseSuggestRequest(body: unknown): { canteenId: string; moods: MoodId[]; note: string; vegOnly: boolean } | null` — unknown mood id or note > 300 chars → null (Review Focus 4).
  - `POST /api/assistant/suggest` → 401 when signed out, 400 when `parseSuggestRequest` is null or the canteen is not the student's canteen, else 200 `{ moment: MealMoment; headline: string; picks: { id: string; name: string; price_paise: number; reason: string }[]; source: "gemini" | "rules" }`. Over the rate limit → rules result. Runtime Node (default).

- [ ] **Step 1: Write failing tests.** `gemini.test.ts` → `parsePicks` drops a foreign id, returns null for a string body, keeps order; `suggestWithGemini` returns null with no key (set `process.env.GEMINI_API_KEY = ""` in the test). `suggest.test.ts` → falls back to rules when the injected gemini resolves null, and uses the gemini picks when present (Review Focus 1). `request.test.ts` → rejects a 301-char note and an unknown mood; accepts a valid body.
- [ ] **Step 2: Run** `npx vitest run src/lib/assist` — expect FAIL.
- [ ] **Step 3: Implement** per Interfaces; `npm i @google/genai`; add `GEMINI_API_KEY=` and `GEMINI_MODEL=gemini-flash-latest` to `.env.example`.
- [ ] **Step 4: Run** `npx vitest run src && npm run typecheck && npm run lint` — expect PASS. Smoke: with the dev server on 3100 and a signed-in demo student cookie, `POST /api/assistant/suggest` with `{canteenId, moods:["tired"], note:""}` returns 3 picks with `source: "rules"`.
- [ ] **Step 5: Commit** `git add package.json package-lock.json .env.example src/lib/assist src/app/api/assistant && git commit -m "feat(assist): Gemini suggest route with rules fallback"`

### Task 3: Mood sheet on the home screen

**Files:**
- Create: `src/components/assist/AssistCard.tsx`, `src/components/assist/MoodSheet.tsx`, `e2e/assist.spec.ts`
- Modify: `src/components/MenuScreen.tsx`

**Interfaces:**
- Consumes: `POST /api/assistant/suggest`, `MOODS`, `momentLabel`, `useCart().add`, `Sheet`, `useToast`, `formatPaise`.
- Produces:
  - `AssistCard({ canteenId, moment })`: replaces the static "Promo" card in `MenuScreen` — copper card, headline `"${momentLabel(moment)}. What are you in the mood for?"`, button "Ask the assistant" that opens `MoodSheet`. `MenuScreen` gets `moment: MealMoment` from the page (computed server-side with `mealMoment(Date.now())`).
  - `MoodSheet({ open, onClose, canteenId })`: chip row from `MOODS` (multi-select, `aria-pressed`), "Veg only" toggle chip, textarea `maxLength=300` labelled "Anything else?", primary button "Suggest"; loading skeleton (3 rows); result: headline + up to 3 rows (name, price, reason, "Add" button → `add(id)` and toast "Added"), "Add all" button; on fetch failure show the rules result? No: the route never fails for the student; a network error shows toast "Check your connection and try again." Never shows the `source`.

- [ ] **Step 1: Write the failing e2e** `e2e/assist.spec.ts` (mobile): signed-in demo student (reuse `signUpStudent`) opens the sheet, taps "Tired" and "Suggest", sees 3 picks, taps the first "Add", and the "View order · 1 item" bar appears (Review Focus 1, with no key in the test env).
- [ ] **Step 2: Run** `PORT=3100 npx playwright test e2e/assist.spec.ts --project=mobile` — expect FAIL.
- [ ] **Step 3: Implement** per Interfaces using the existing design tokens (`rounded-card`, `bg-brand`, `shadow-lift`, `Sheet`), phone-first, 44 px targets.
- [ ] **Step 4: Run** the e2e, then `npm run typecheck && npm run lint && npx vitest run src` — expect PASS.
- [ ] **Step 5: Commit** `git add src/components e2e/assist.spec.ts && git commit -m "feat(assist): mood sheet with grounded suggestions"`

### Task 4: Chat that answers and adds to the cart

**Files:**
- Create: `src/lib/assist/chat.ts`, `src/lib/assist/chat.test.ts`, `src/app/api/assistant/chat/route.ts`, `src/components/assist/ChatSheet.tsx`
- Modify: `src/components/assist/AssistCard.tsx` (second button "Chat"), `src/lib/assist/request.ts` (`parseChatRequest`)

**Interfaces:**
- Consumes: `suggestWithGemini`'s client setup pattern, `rateLimit`, `rankCandidates` (moment only, no moods) for the grounding list, open slots query from `src/app/(student)/checkout/page.tsx`.
- Produces:
  - `type ChatTurn = { role: "user" | "model"; text: string }`; `parseChatRequest(body: unknown): { canteenId: string; turns: ChatTurn[] } | null` — 1..10 turns, each ≤ 300 chars, last turn `user`.
  - `buildChatContents(turns, grounding: { canteenName; moment; items: SuggestInput["candidates"]; slots: string[] })`: the grounding block is the first user part, then the turns.
  - `CHAT_SCHEMA` = `{ reply: string; add: { id: string; qty: number }[] }`; `parseChatReply(raw: unknown, allowedIds): { reply: string; add: { id; qty }[] } | null` (qty clamped 1..5, foreign ids dropped).
  - `chat(input): Promise<{ reply: string; add: { id: string; name: string; qty: number }[]; source }>` — Gemini with `CHAT_SYSTEM` (canteen food on this campus only; reply in the user's language, ≤ 2 sentences; when the user asks for something, propose items in `add`; never claim an order was placed; mention the next pickup times when asked about timing); offline/failed/limited → `{ reply: "The assistant is taking a break. Try the mood picker above.", add: [] }`.
  - `POST /api/assistant/chat` → same auth/validation shape as suggest; 200 `{ reply, add, source }`.
  - `ChatSheet`: message list, input (maxLength 300), send; a model turn with `add` renders item chips with "Add to cart" (applies `useCart().add` × qty) and "Added ✓" state. The client never sends model-proposed ids back unverified: it only adds ids it received from the route.

- [ ] **Step 1: Write failing tests** `chat.test.ts`: `parseChatRequest` rejects 11 turns and a last `model` turn; `parseChatReply` clamps qty 9 → 5 and drops a foreign id; `buildChatContents` starts with the grounding block and ends with the last user turn.
- [ ] **Step 2: Run** `npx vitest run src/lib/assist/chat.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `npx vitest run src && npm run typecheck && npm run lint` — expect PASS. ⚠️ Manual check when a key is available: ask "write my assignment" and confirm the reply stays on food with `add: []` (Review Focus 5).
- [ ] **Step 5: Commit** `git add src/lib/assist src/app/api/assistant src/components/assist && git commit -m "feat(assist): chat that suggests and adds to the cart"`

### Task 5: Usual and popular signals, price sort and filters

**Execution order note:** run Tasks 3, 5, 6, then 4. Task 5 starts after Task 3 is committed (both edit `MenuScreen.tsx`).

**Files:**
- Create: `supabase/migrations/0011_popular_items.sql`, `src/lib/menuFilter.ts`, `src/lib/menuFilter.test.ts`, `src/lib/signals.ts`, `src/lib/signals.test.ts`, `src/components/QuickRows.tsx`, `tests/integration/popular.test.ts`, `e2e/browse.spec.ts`
- Modify: `src/components/MenuScreen.tsx`, `src/components/MenuList.tsx` (prop `flat?: boolean`), `src/lib/assist/engine.ts`, `src/lib/assist/engine.test.ts`, `src/lib/assist/gemini.ts` (badges in the prompt), `src/app/api/assistant/suggest/route.ts` (load signals), `src/app/(student)/page.tsx`

**Interfaces:**
- Consumes: `MenuItem`, `rankCandidates`, `studentCanteen`, `useCart().add`, `has_canteen_role`, `current_college_id()`.
- Produces SQL: `public.popular_items(p_canteen_id uuid, p_days int default 30, p_limit int default 8) returns table (menu_item_id uuid, orders bigint)` — `security definer`, `stable`, `set search_path = ''`. Returns rows only when the caller is signed in and `current_college_id()` equals the canteen's `college_id` or `has_canteen_role(p_canteen_id, 'staff')`, else zero rows. Counts distinct orders of the last `p_days` days (clamped 1..90) whose status is not `cancelled` or `no_show`, only for items that are `is_available`, ordered by count desc then name, `p_limit` clamped 1..20. Returns counts only, never a student id. Revoke from `public, anon`; grant to `authenticated`.
- Produces TS in `menuFilter.ts`: `type MenuSort = "default" | "price-asc" | "price-desc"`; `type MenuView = { query: string; category: string | null; maxPaise: number | null; sort: MenuSort }`; `PRICE_CAPS: readonly { paise: number; label: string }[]` = `[{3000,"Under ₹30"},{5000,"Under ₹50"},{10000,"Under ₹100"}]`; `applyMenuView(items: MenuItem[], view: MenuView): MenuItem[]` — category match, case-insensitive name contains `query`, **strictly less than** `maxPaise` when set; `price-asc` / `price-desc` sort by `price_paise` with ties by name; `default` keeps the incoming order; `isFlatView(view: MenuView): boolean` (true when `sort !== "default"`: the list then shows one grid without category headings).
- Produces TS in `signals.ts`: `type Signals = { usual: Record<string, number>; popular: Record<string, number> }` (`usual` = times I ordered each item, `popular` = campus orders per item); `emptySignals(): Signals`; `fetchSignals(supabase: SupabaseClient, canteenId: string): Promise<Signals>` — `usual` from my own non-cancelled, non-no-show orders in this canteen (RLS already limits `order_items` to my orders), `popular` from `popular_items`; any query error yields the empty half, never a throw; `topUsual(signals: Signals, items: MenuItem[], n = 4): MenuItem[]` and `topPopular(signals: Signals, items: MenuItem[], n = 6): MenuItem[]` — available items only, count desc, ties by name.
- Produces UI: `QuickRows({ items, signals })` renders "Order again" (shown only when `topUsual` is non-empty) and "Most ordered" (only when `topPopular` is non-empty) as horizontally scrolling rows of compact cards (photo via `menuPhoto`, name, price, 44 px Add button, `aria-label` `Add ${name}`), placed under the assistant card and above the category chips. `MenuScreen` gains `signals: Signals` from the page (server-fetched). Filter row below the category chips: two sort chips "Price: low to high" and "Price: high to low" (`aria-pressed`, tapping the active one returns to default) and the three `PRICE_CAPS` chips (single select, tap again to clear). With a flat view `MenuList` gets `flat` and renders one grid with no category `h2`s. Search, category and the new controls compose through `applyMenuView`.
- Engine: `rankCandidates` ctx gains optional `signals?: Signals`: +2 when `usual[id] > 0` (+1 more when `usual[id] >= 3`), +1 when the item is among the top 5 popular; reasons "You've had this before" / "Popular here" (still at most 3 reasons, still at most 12 candidates). `SuggestInput.candidates[i]` gains optional `badges?: ("usual" | "popular")[]`, written into the prompt line as plain tags `usual` / `popular`; counts, dates and order contents never reach the model.

- [ ] **Step 1: Write failing tests.** `menuFilter.test.ts`: `price-asc` puts ₹12 before ₹35 before ₹80; `price-desc` reverses; `maxPaise: 5000` drops a ₹50 item and keeps ₹49.99 (strict); category + query + cap compose; `default` keeps the incoming order; `isFlatView` true only for price sorts. `signals.test.ts`: `topUsual` orders by count then name and skips sold-out items; `topPopular` same; both return `[]` for empty signals. `engine.test.ts`: with equal tags and moment, the item with `usual[id] = 3` outranks the one without and carries the reason "You've had this before"; a popular item carries "Popular here"; reasons stay ≤ 3. `popular.test.ts` (integration): counts distinct orders (one order with qty 5 counts once), excludes `cancelled` and `no_show` orders, excludes another canteen's items, a student of another college and a signed-out caller get zero rows, the result columns are exactly `menu_item_id, orders`, `p_limit = 500` returns at most 20.
- [ ] **Step 2: Run** `npx vitest run src tests/integration/popular.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the migration (apply with `npx supabase migration up`, not `db reset`), the modules, `QuickRows`, the filter row, the engine and route changes per Interfaces.
- [ ] **Step 4: Write and run the e2e** `e2e/browse.spec.ts` (mobile, `PORT=3100`): tapping "Price: low to high" makes the first visible card the cheapest available item and removes the category headings; tapping "Under ₹30" leaves only items under ₹30; a student with no orders sees no "Order again" row; after placing an order for one item through the UI the home screen shows "Order again" containing that item.
- [ ] **Step 5: Run** `npx vitest run && npm run typecheck && npm run lint && PORT=3100 npx playwright test e2e/browse.spec.ts e2e/assist.spec.ts --project=mobile` — expect PASS.
- [ ] **Step 6: Commit** `git add supabase src tests e2e && git commit -m "feat(menu): usual and popular rows, price sort and filters"` (stage only this task's files).

### Task 6: Star feedback after delivery, shown to staff

**Files:**
- Create: `supabase/migrations/0012_order_feedback.sql`, `src/lib/feedback/actions.ts`, `src/lib/feedback/summary.ts`, `src/lib/feedback/summary.test.ts`, `src/components/FeedbackForm.tsx`, `src/app/staff/feedback/page.tsx`, `src/components/staff/FeedbackList.tsx`, `tests/integration/feedback.test.ts`, `e2e/feedback.spec.ts`
- Modify: `src/components/OrderTracker.tsx`, `src/app/(student)/orders/[code]/page.tsx`, `src/app/staff/page.tsx` (header link "Feedback")

**Interfaces:**
- Consumes: `orders` (status `collected` is "delivered"), `has_canteen_role`, `consoleCanteen`, `collectOrder`, `createClient` (server).
- Produces SQL:
  - `public.order_feedback (order_id uuid primary key references public.orders on delete cascade, canteen_id uuid not null references public.canteens, student_id uuid not null references public.profiles, rating int not null check (rating between 1 and 5), comment text check (comment is null or char_length(comment) <= 500), created_at timestamptz not null default now())` plus index `(canteen_id, created_at desc)`. RLS on; `revoke all` from `anon, authenticated`; `grant select` to `authenticated`; policies: select own (`student_id = (select auth.uid())`) and select when `(select public.has_canteen_role(canteen_id, 'staff'))`. No client writes.
  - `public.submit_feedback(p_order_id uuid, p_rating int, p_comment text) returns public.order_feedback` — `security definer`, `set search_path = ''`. Errors as bare strings: `ORDER_NOT_FOUND` (not the caller's order, or caller not an active student), `NOT_COLLECTED` (status is not `collected`), `INVALID_RATING` (outside 1..5 or null), `INVALID_COMMENT` (trimmed length over 500; an empty comment is stored as null), `ALREADY_SUBMITTED` (the primary key conflict, including a concurrent double tap). Locks the order row first. Revoke from `public, anon`; grant to `authenticated`.
  - View `public.staff_feedback_v` (`security_invoker = false`, filtered by `public.has_canteen_role(f.canteen_id, 'staff')`): `order_id, canteen_id, rating, comment, created_at, order_code, student_name, items text` (`'2× Samosa, 1× Tea'` from `order_items` via `string_agg`). Revoke all, grant select to `authenticated`.
- Produces TS:
  - `type FeedbackError = "ORDER_NOT_FOUND" | "NOT_COLLECTED" | "INVALID_RATING" | "INVALID_COMMENT" | "ALREADY_SUBMITTED" | "UNKNOWN"`; `submitFeedback(input: { orderId: string; rating: number; comment: string }): Promise<{ ok: true } | { ok: false; error: FeedbackError }>` ("use server", calls `submit_feedback`, maps by `error.message`).
  - `type FeedbackRow = { order_id: string; rating: number; comment: string | null; created_at: string; order_code: string; student_name: string; items: string }`; `summarizeFeedback(rows: { rating: number }[]): { count: number; average: number | null; distribution: [number, number, number, number, number] }` (average rounded to one decimal; `null` and zeros for an empty list).
  - `FeedbackForm({ orderId, existing }: { orderId: string; existing: { rating: number; comment: string | null } | null })`: five star buttons in a `role="radiogroup"` labelled "Rating", each 44 px with `aria-label` "1 star" … "5 stars", an optional textarea labelled "Anything to add?" (`maxLength` 500), button "Send feedback" disabled until a star is chosen; success switches to a read-only "Thanks! You rated it ★★★★☆" state; with `existing` set it renders that read-only state at once. Errors show friendly copy (`ALREADY_SUBMITTED` → show the thanks state; others → "We could not send your feedback. Please try again.").
  - `OrderTracker` renders `FeedbackForm` under the timeline only when `status === "collected"`; `orders/[code]/page.tsx` loads the order's existing feedback row (own, via RLS) and passes it down as `existingFeedback`.
  - `/staff/feedback` (server page, staff and admin only through the existing proxy rules): header with the canteen name and a back link to `/staff`; summary card (average as a large number with stars, the count, a five-row distribution bar chart); `FeedbackList` of the latest 100 rows from `staff_feedback_v` ordered `created_at desc` (stars, comment as plain text, order code in the mono face, student name, items, relative time); empty state "No feedback yet". The staff console header gains a "Feedback" link to it.

- [ ] **Step 1: Write failing tests.** `summary.test.ts`: `[5,4,4]` → count 3, average 4.3, distribution `[0,0,0,2,1]`; empty → average `null`. `feedback.test.ts` (integration): `submit_feedback` stores rating and comment on a collected order; a second call raises `ALREADY_SUBMITTED` and the stored rating is unchanged; a `placed` order raises `NOT_COLLECTED`; another student's order raises `ORDER_NOT_FOUND`; rating 0 and 6 raise `INVALID_RATING`; a 501-character comment raises `INVALID_COMMENT`; two concurrent calls for one order give exactly one success and one `ALREADY_SUBMITTED`; a student cannot insert into `order_feedback` directly (`42501`); student B reads 0 of student A's feedback rows; staff of the order's canteen read the row from `staff_feedback_v` with `order_code` and `items`; staff of another canteen read 0 rows; a staff profile with no membership reads 0 rows.
- [ ] **Step 2: Run** `npx vitest run src/lib/feedback tests/integration/feedback.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the migration (apply with `npx supabase migration up`), actions, summary, form, tracker and page wiring, staff page and list per Interfaces, in the existing design tokens, phone-first, one-handed on the staff page.
- [ ] **Step 4: Write and run the e2e** `e2e/feedback.spec.ts` (mobile, `PORT=3100`): a student places an order, staff collect it (service-role `collect_order` via the `admin` helper is acceptable), the student opens the order page, taps "4 stars", types a comment, taps "Send feedback" and sees "Thanks! You rated it ★★★★☆"; reloading still shows the read-only state; the form never appears while the order is `placed`; a staff login opens `/staff/feedback` and sees the comment, the order code and the 4-star rating.
- [ ] **Step 5: Run** `npx vitest run && npm run typecheck && npm run lint && PORT=3100 npx playwright test e2e/feedback.spec.ts --project=mobile` — expect PASS.
- [ ] **Step 6: Commit** `git add supabase src tests e2e && git commit -m "feat(feedback): star rating after delivery, visible to staff"` (stage only this task's files).

---

## Self-Review Notes

- **Scope additions (user request, 2026-10-17):** order-again and most-ordered suggestions, price sort and caps, post-delivery star feedback visible to staff (Tasks 5 and 6). Privacy ruling: the model sees only the derived badges `usual` / `popular` per candidate, never counts, dates or order contents.
- **Spec coverage:** meal-moment engine and mood → food with explanations (T1, T2); Gemini via `@google/genai`, structured JSON, candidate-grounded, server-only key, timeout, rate limit, silent fallback, privacy of inputs (T2); mood chips + free text UI (T3); assistant that acts by adding to the cart, with the order placed by a human (T4). Deferred to later phases: profile diet/budget storage, taste memory, timetable, call logging table.
- **Type consistency:** `MealMoment`, `MoodId`, `Candidate`, `SuggestInput`, `SuggestResult`, `Pick` are defined in T1/T2 and consumed by name in T3/T4; the suggest and chat routes share `rateLimit` and the `parse*Request` helpers.
- **Dependencies:** sequential T1 → T2 → T3 → T4; T4 depends on T3 only for the card button.
