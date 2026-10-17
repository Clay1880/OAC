import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseEnv, supabaseServiceRoleKey, supabaseUrl } from "./env";

const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const ANON_VAR = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const PUBLISHABLE_VAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const SERVICE_VAR = "SUPABASE_SERVICE_ROLE_KEY";

/** Sets exactly these variables and leaves the rest of the Supabase ones unset. */
function setEnv(values: Partial<Record<string, string>>) {
  for (const name of [URL_VAR, ANON_VAR, PUBLISHABLE_VAR, SERVICE_VAR, "VERCEL"]) {
    vi.stubEnv(name, values[name] as string | undefined);
  }
}

afterEach(() => vi.unstubAllEnvs());

describe("supabaseEnv", () => {
  it("returns the url and anon key when both are set", () => {
    setEnv({ [URL_VAR]: "https://abc.supabase.co", [ANON_VAR]: "anon-key" });
    expect(supabaseEnv()).toEqual({ url: "https://abc.supabase.co", anonKey: "anon-key" });
  });

  it("names every missing variable in one message", () => {
    setEnv({});
    expect(() => supabaseEnv()).toThrowError(new RegExp(`${URL_VAR}.*${ANON_VAR}`));
  });

  it("names only the variable that is missing", () => {
    setEnv({ [URL_VAR]: "https://abc.supabase.co" });
    expect(() => supabaseEnv()).toThrowError(ANON_VAR);
    expect(() => supabaseEnv()).not.toThrowError(URL_VAR);
  });

  it("treats an empty value like an unset one", () => {
    setEnv({ [URL_VAR]: "   ", [ANON_VAR]: "anon-key" });
    expect(() => supabaseEnv()).toThrowError(URL_VAR);
  });

  it("accepts the publishable key name Supabase uses for new projects", () => {
    setEnv({ [URL_VAR]: "https://abc.supabase.co", [PUBLISHABLE_VAR]: "sb_publishable_x" });
    expect(supabaseEnv().anonKey).toBe("sb_publishable_x");
  });

  it("trims spaces and the quotes people paste into a dashboard", () => {
    setEnv({ [URL_VAR]: ' "https://abc.supabase.co" ', [ANON_VAR]: "'anon-key'\n" });
    expect(supabaseEnv()).toEqual({ url: "https://abc.supabase.co", anonKey: "anon-key" });
  });

  it("explains an unusable url without echoing it", () => {
    setEnv({ [URL_VAR]: "my-project-url", [ANON_VAR]: "anon-key" });
    expect(() => supabaseEnv()).toThrowError(/not a valid URL/);
    expect(() => supabaseEnv()).not.toThrowError(/my-project-url/);
  });

  it("refuses a localhost url on a Vercel deployment, where it can never be reached", () => {
    setEnv({ [URL_VAR]: "http://127.0.0.1:54321", [ANON_VAR]: "anon-key", VERCEL: "1" });
    expect(() => supabaseEnv()).toThrowError(/localhost/i);
  });

  it("allows a localhost url everywhere else, such as a production build on your own machine", () => {
    setEnv({ [URL_VAR]: "http://127.0.0.1:54321", [ANON_VAR]: "anon-key" });
    expect(supabaseEnv().url).toBe("http://127.0.0.1:54321");
  });
});

describe("supabaseUrl", () => {
  it("returns just the url, without needing the anon key", () => {
    setEnv({ [URL_VAR]: "https://abc.supabase.co" });
    expect(supabaseUrl()).toBe("https://abc.supabase.co");
  });

  it("names the url variable when it is missing", () => {
    setEnv({ [ANON_VAR]: "anon-key" });
    expect(() => supabaseUrl()).toThrowError(URL_VAR);
  });
});

describe("supabaseServiceRoleKey", () => {
  it("returns the key when set", () => {
    setEnv({ [SERVICE_VAR]: "service-key" });
    expect(supabaseServiceRoleKey()).toBe("service-key");
  });

  it("says the key is server only when it is missing, and never prints a value", () => {
    setEnv({});
    expect(() => supabaseServiceRoleKey()).toThrowError(SERVICE_VAR);
    expect(() => supabaseServiceRoleKey()).toThrowError(/server/i);
  });
});
