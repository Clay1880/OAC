/**
 * What scripts/seed-demo.ts may do against a given Supabase project.
 *
 * The demo accounts have a password, and the default one is printed in this public repository. That
 * is fine on a laptop. On a hosted project it would let anyone sign in, and the demo staff account
 * can see students' phone numbers, so a hosted seed needs a private password and, unless asked,
 * no admin account.
 */

/** The password used on a local stack. Published in the repository: never use it on a hosted project. */
export const LOCAL_DEMO_PASSWORD = "oac-demo-123";

const MIN_REMOTE_PASSWORD_LENGTH = 10;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

export type DemoSeedPlan = { remote: boolean; password: string; withAdmin: boolean };

export function planDemoSeed(
  supabaseUrl: string,
  env: { DEMO_PASSWORD?: string; DEMO_WITH_ADMIN?: string },
): { ok: true; plan: DemoSeedPlan } | { ok: false; error: string } {
  let host: string;
  try {
    host = new URL(supabaseUrl).hostname;
  } catch {
    return { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL." };
  }

  const chosen = env.DEMO_PASSWORD?.trim() || undefined;

  if (LOCAL_HOSTS.has(host)) {
    return { ok: true, plan: { remote: false, password: chosen ?? LOCAL_DEMO_PASSWORD, withAdmin: true } };
  }

  if (!chosen || chosen === LOCAL_DEMO_PASSWORD || chosen.length < MIN_REMOTE_PASSWORD_LENGTH) {
    return {
      ok: false,
      error:
        `This is a hosted Supabase project (${host}). The default demo password is published in the public repository, ` +
        `so it is not allowed here. Set a private DEMO_PASSWORD of at least ${MIN_REMOTE_PASSWORD_LENGTH} characters ` +
        "for this run, for example in PowerShell: $env:DEMO_PASSWORD = '<something only you know>'.",
    };
  }
  return { ok: true, plan: { remote: true, password: chosen, withAdmin: env.DEMO_WITH_ADMIN === "1" } };
}
