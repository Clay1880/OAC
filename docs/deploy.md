# Deploying OAC

The app is a Next.js site plus a Supabase project (database, sign-in, realtime). A deployed site cannot reach the Supabase that `supabase start` runs on your laptop (`http://127.0.0.1:54321`), so a deployment needs its own hosted Supabase project.

## If you see "Your project's URL and Key are required to create a Supabase client!"

The host has no Supabase settings. They live in your local `.env.local`, which is never uploaded. Set the variables below in the host's project settings and **redeploy**. The `NEXT_PUBLIC_` ones are baked into the site while it builds, so a redeploy is required, not just a restart. The app now names the exact variable that is missing.

## Environment variables

| Variable | Where to find it | Needed |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard, Project Settings, API, Project URL (`https://<ref>.supabase.co`) | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page, `anon` / publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` also works) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, `service_role` key. Secret: never give it a `NEXT_PUBLIC_` prefix | yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys`; subject like `mailto:canteen@college.edu` | for "order ready" notifications; skipped if unset |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Google AI Studio; model defaults to `gemini-flash-latest` | optional; without a key the assistant uses its built-in rules |
| `DEMO_LOGIN` | Set to `true` only to enable the demo sign-in at `/demo-login` for a presentation (see "Demo accounts" below). Leave unset for a real launch | no |

On Vercel: Project, Settings, Environment Variables. Add each one for Production (and Preview if you use it), with no quotes and no trailing spaces, then Deployments, Redeploy.

## One-time setup of the hosted Supabase project

1. Create a project at supabase.com and note its reference (the `<ref>` in its URL).
2. **Easiest, no CLI:** open the dashboard, SQL Editor, New query; paste the whole of `supabase/hosted-setup.sql` (every migration plus the menu seed, in one transaction) and press Run. It must run on an **empty** project. If a migration or the seed changes later, regenerate the file with `node scripts/build-hosted-sql.mjs` and apply only the new migration's section by hand.

   **Alternative, with the CLI** (from a clean, committed checkout; `db push` applies every file in `supabase/migrations`, including half-edited ones in a dirty working tree):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. With the CLI route, `db push` does not run `supabase/seed.sql`: run it once in the dashboard SQL editor to add the college domain and the menu (or add dishes in the admin console). To use your own email domain, insert it instead: `insert into public.college_domains (domain, college_id) select 'yourcollege.edu', id from public.colleges where slug = 'ait-pune';`
4. Dashboard, Authentication:
   - URL Configuration: set Site URL to your deployed address and add it to Redirect URLs.
   - Providers, Email: enabled, with "Confirm email" on.
   - Email Templates: paste `supabase/templates/otp.html` into both "Magic Link" and "Confirm signup", so students receive a 6-digit code instead of a link.
   - SMTP: set a custom SMTP sender. The built-in sender allows only a few emails per hour, far too few for a college.
5. Create the first admin from your own machine, pointing at the hosted project (the script reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment or `.env.local`):
   ```bash
   npx tsx scripts/create-admin.ts <login-id> <password> "<full name>"
   ```
   Then sign in at `/staff-login`. Staff accounts are created from the admin console.

## Demo accounts on the hosted site (presentations only)

"That login ID or password is not right" on `/demo-login` has two causes, and you usually need to fix both:

1. **The accounts do not exist.** They are created by a script, so the ones on your laptop are not on the hosted project.
2. **The feature is off.** `/demo-login` only works when the host has `DEMO_LOGIN=true`. Add it, then redeploy.

Create the accounts on the hosted project from your own machine. The default password is published in this public repository, so the script refuses to use it on a hosted project. Copy `.env.hosted.example` to `.env.hosted.local` (git-ignored), fill in the project URL, the `service_role` key and a private `DEMO_PASSWORD` of at least 6 characters, then run:

```bash
npm run demo:hosted
```

This creates `demo.student` (sign in at `/demo-login`) and `demo.staff` (sign in at `/staff-login`) with that password, and opens pickup slots for the rest of today, so run it again before each demo. It skips `demo.admin` unless the file also sets `DEMO_WITH_ADMIN=1` (set it: the admin console is where you open more pickup slots and edit the menu). The database must be set up first (steps 2 and 3 above), or the script stops with "College ait-pune not found".

Anyone who knows the password can use these accounts, and the staff account can see students' names and phone numbers. Share the password only with the people at the demo, and delete the accounts afterwards (Supabase dashboard, Authentication, Users), or turn `DEMO_LOGIN` off.

## Other errors you may meet

| Message | Cause |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL is not a valid URL` | The value is empty, has stray text, or is not `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_URL points at localhost` | The Vercel variable still holds the local `127.0.0.1` address |
| `Invalid API key` | The anon key belongs to a different project than the URL |
| Students never get the sign-in code | SMTP not configured, or the email domain is not in `college_domains` |
