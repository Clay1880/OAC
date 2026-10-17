/**
 * Prepare the app for a presentation.
 *
 *   npx tsx scripts/seed-demo.ts
 *
 * Creates (or resets) a demo student, staff and admin account with a known password, and opens
 * pickup slots (every 5 minutes) for the rest of today, so the whole flow can be shown without the OTP email.
 * Safe to run repeatedly; run it again right before presenting to get fresh slots. It uses the
 * service-role key, and the demo student sign-in is off unless the app has DEMO_LOGIN=true.
 *
 * Sign-in:  student at /demo-login, staff at /staff-login, admin at /staff-login.
 *
 * Against a HOSTED Supabase project it refuses to use the default password (published in this public
 * repository). Put the project's URL, its service_role key and a private DEMO_PASSWORD (6+ characters)
 * in .env.hosted.local (copy .env.hosted.example) and run:
 *
 *   npm run demo:hosted                     # = tsx scripts/seed-demo.ts --env .env.hosted.local
 *
 * It skips demo.admin on a hosted project unless that file also sets DEMO_WITH_ADMIN=1.
 *
 * You can skip this script on a hosted site entirely: when the host sets DEMO_PASSWORD, the first
 * sign-in at /demo-login with that password creates the same accounts and slots (src/lib/demo/accounts.ts).
 */
import { createClient } from "@supabase/supabase-js";
import { provisionDemo } from "../src/lib/demo/accounts";
import { planDemoSeed } from "../src/lib/demoSeedConfig";

async function main() {
  // `--env <file>` points at a hosted project's settings (see .env.hosted.example); the default is the local stack.
  const envIndex = process.argv.indexOf("--env");
  const envFile = envIndex === -1 ? ".env.local" : process.argv[envIndex + 1];
  if (!envFile) {
    console.error("Usage: tsx scripts/seed-demo.ts [--env <file>]");
    process.exit(1);
  }
  try {
    process.loadEnvFile(envFile);
  } catch {
    if (envIndex !== -1) {
      console.error(`Could not read ${envFile}. Copy .env.hosted.example to ${envFile} and fill in the values.`);
      process.exit(1);
    }
    // No .env.local: rely on the real environment.
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (environment or .env.local).");
    process.exit(1);
  }
  const decision = planDemoSeed(url, {
    DEMO_PASSWORD: process.env.DEMO_PASSWORD,
    DEMO_WITH_ADMIN: process.env.DEMO_WITH_ADMIN,
  });
  if (!decision.ok) {
    console.error(decision.error);
    process.exit(1);
  }
  const { plan } = decision;

  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { slots } = await provisionDemo(service, { password: plan.password, withAdmin: plan.withAdmin });

  // A private password is never echoed; the default one is public anyway.
  console.log(plan.remote ? "Demo accounts ready (password: the DEMO_PASSWORD you set)" : `Demo accounts ready (password for all: ${plan.password})`);
  console.log("  Student  /demo-login   ID: demo.student");
  console.log("  Staff    /staff-login  ID: demo.staff");
  if (plan.withAdmin) console.log("  Admin    /staff-login  ID: demo.admin");
  console.log(slots === 0 ? "No slots added: it is too late in the day. Add some in the admin console." : `Slots open for the rest of today: ${slots}`);
  if (plan.remote) {
    console.log("");
    console.log("Also set DEMO_LOGIN=true on your host and redeploy, or /demo-login will keep saying the ID or password is wrong.");
    console.log("Anyone who has the password can use these accounts; delete them from Supabase (Authentication, Users) after the demo.");
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
