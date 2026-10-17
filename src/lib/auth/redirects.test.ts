import { describe, expect, it } from "vitest";
import { homeFor } from "./redirects";

describe("homeFor", () => {
  it("sends signed-out visitors to login", () => {
    expect(homeFor(null, false)).toBe("/login");
  });
  it("sends a student without a profile to onboarding", () => {
    expect(homeFor("student", false)).toBe("/onboarding");
  });
  it("sends each role to its home", () => {
    expect(homeFor("student", true)).toBe("/");
    expect(homeFor("staff", true)).toBe("/staff");
    expect(homeFor("admin", true)).toBe("/admin");
  });
  it("forces a temporary password to be changed first", () => {
    expect(homeFor("staff", true, true)).toBe("/change-password");
  });
  it("turns deactivated accounts away", () => {
    expect(homeFor("staff", true, false, false)).toBe("/login?inactive=1");
  });
  it("deactivation wins over a pending password change", () => {
    expect(homeFor("staff", true, true, false)).toBe("/login?inactive=1");
  });
});
