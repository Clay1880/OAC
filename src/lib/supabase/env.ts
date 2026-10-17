/**
 * The Supabase settings, with an error that says exactly what is missing.
 *
 * Every variable is written out literally (never `process.env[name]`): Next.js replaces the
 * NEXT_PUBLIC_* ones with their values while it builds, and only does so for literal names.
 * That also means they must be set where the app is BUILT, so after adding one on a host,
 * redeploy.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

const HOW_TO_FIX =
  "Add it in your hosting provider's project settings (on Vercel: Project, Settings, Environment Variables), " +
  "then redeploy, because NEXT_PUBLIC_* values are baked in at build time. See docs/deploy.md.";

/** A value as typed into a dashboard: trimmed, without the quotes people sometimes paste around it. */
function clean(value: string | undefined): string | undefined {
  return value?.trim().replace(/^["']+|["']+$/g, "").trim() || undefined;
}

function readUrl(): string | undefined {
  return clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function readAnonKey(): string | undefined {
  // Supabase now calls the same key "publishable"; accept either name.
  return clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ?? clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

function missing(names: string[]): Error {
  return new Error(
    `Missing environment variable${names.length > 1 ? "s" : ""}: ${names.join(", ")}. ` +
      `The app cannot reach Supabase without ${names.length > 1 ? "them" : "it"}. ${HOW_TO_FIX}`,
  );
}

/** Checks the url is usable. The value is never echoed, in case a key was pasted into the wrong field. */
function checkedUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not a valid URL. It should look like https://<project-ref>.supabase.co " +
        "(Supabase dashboard, Project Settings, API).",
    );
  }
  // Only on Vercel: a production build on your own machine may legitimately talk to your local stack.
  if (process.env.VERCEL && LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL points at localhost, which a deployed app can never reach. " +
        "Use your hosted project's URL (https://<project-ref>.supabase.co). See docs/deploy.md.",
    );
  }
  return url;
}

/** The project URL, for callers that do not need the anon key (the service-role client). */
export function supabaseUrl(): string {
  const url = readUrl();
  if (!url) throw missing(["NEXT_PUBLIC_SUPABASE_URL"]);
  return checkedUrl(url);
}

/** The project URL and public key, for the browser, server and proxy clients. */
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = readUrl();
  const anonKey = readAnonKey();
  const absent = [
    ...(url ? [] : ["NEXT_PUBLIC_SUPABASE_URL"]),
    ...(anonKey ? [] : ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
  ];
  if (!url || !anonKey) throw missing(absent);
  return { url: checkedUrl(url), anonKey };
}

/** The service-role key. Server only: it bypasses every row-level security rule. */
export function supabaseServiceRoleKey(): string {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) {
    throw new Error(
      "Missing environment variable: SUPABASE_SERVICE_ROLE_KEY. It is a server-only secret (Supabase dashboard, " +
        "Project Settings, API, service_role). Add it as a server environment variable without the NEXT_PUBLIC_ " +
        "prefix, then redeploy. See docs/deploy.md.",
    );
  }
  return key;
}
