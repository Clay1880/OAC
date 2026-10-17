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

---

## Self-Review Notes

- **Spec coverage:** meal-moment engine and mood → food with explanations (T1, T2); Gemini via `@google/genai`, structured JSON, candidate-grounded, server-only key, timeout, rate limit, silent fallback, privacy of inputs (T2); mood chips + free text UI (T3); assistant that acts by adding to the cart, with the order placed by a human (T4). Deferred to later phases: profile diet/budget storage, taste memory, timetable, call logging table.
- **Type consistency:** `MealMoment`, `MoodId`, `Candidate`, `SuggestInput`, `SuggestResult`, `Pick` are defined in T1/T2 and consumed by name in T3/T4; the suggest and chat routes share `rateLimit` and the `parse*Request` helpers.
- **Dependencies:** sequential T1 → T2 → T3 → T4; T4 depends on T3 only for the card button.
