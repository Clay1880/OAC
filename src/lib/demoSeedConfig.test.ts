import { describe, expect, it } from "vitest";
import { LOCAL_DEMO_PASSWORD, planDemoSeed } from "./demoSeedConfig";

const LOCAL = "http://127.0.0.1:54321";
const HOSTED = "https://abcdefgh.supabase.co";

describe("planDemoSeed on a local stack", () => {
  it("keeps the well-known demo password and creates every account, admin included", () => {
    expect(planDemoSeed(LOCAL, {})).toEqual({
      ok: true,
      plan: { remote: false, password: LOCAL_DEMO_PASSWORD, withAdmin: true },
    });
  });

  it.each(["http://localhost:54321", "http://[::1]:54321", "http://0.0.0.0:54321"])("treats %s as local", (url) => {
    const result = planDemoSeed(url, {});
    expect(result.ok && result.plan.remote).toBe(false);
  });

  it("lets DEMO_PASSWORD override the default", () => {
    const result = planDemoSeed(LOCAL, { DEMO_PASSWORD: "  my-own-password  " });
    expect(result.ok && result.plan.password).toBe("my-own-password");
  });
});

describe("planDemoSeed on a hosted project", () => {
  it("refuses without a private password, because the default is published in a public repository", () => {
    const result = planDemoSeed(HOSTED, {});
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/DEMO_PASSWORD/);
  });

  it("refuses the published default password", () => {
    expect(planDemoSeed(HOSTED, { DEMO_PASSWORD: LOCAL_DEMO_PASSWORD }).ok).toBe(false);
  });

  it("refuses a password shorter than 6 characters, Supabase Auth's own minimum", () => {
    expect(planDemoSeed(HOSTED, { DEMO_PASSWORD: "12345" }).ok).toBe(false);
    expect(planDemoSeed(HOSTED, { DEMO_PASSWORD: "123456" }).ok).toBe(true);
  });

  it("accepts a private password and leaves the admin account out", () => {
    expect(planDemoSeed(HOSTED, { DEMO_PASSWORD: "a-private-password" })).toEqual({
      ok: true,
      plan: { remote: true, password: "a-private-password", withAdmin: false },
    });
  });

  it("creates the demo admin only when DEMO_WITH_ADMIN is 1", () => {
    const withAdmin = planDemoSeed(HOSTED, { DEMO_PASSWORD: "a-private-password", DEMO_WITH_ADMIN: "1" });
    const maybe = planDemoSeed(HOSTED, { DEMO_PASSWORD: "a-private-password", DEMO_WITH_ADMIN: "true" });
    expect(withAdmin.ok && withAdmin.plan.withAdmin).toBe(true);
    expect(maybe.ok && maybe.plan.withAdmin).toBe(false);
  });
});

describe("planDemoSeed with a bad url", () => {
  it("explains it instead of throwing", () => {
    const result = planDemoSeed("not a url", {});
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/not a valid URL/);
  });
});
