import { describe, expect, it } from "vitest";
import { isCollegeEmail, normalizePhone } from "./validate";

describe("isCollegeEmail", () => {
  const domains = ["college.edu", "second.ac.in"] as const;

  it("accepts an address on any listed college domain, ignoring case and padding", () => {
    expect(isCollegeEmail("asha@college.edu", domains)).toBe(true);
    expect(isCollegeEmail("  Asha.Rao@College.EDU ", domains)).toBe(true);
    expect(isCollegeEmail("ravi@second.ac.in", domains)).toBe(true);
    expect(isCollegeEmail("RAVI@SECOND.AC.IN", domains)).toBe(true);
  });
  it("rejects other domains, subdomains and look-alikes", () => {
    expect(isCollegeEmail("asha@gmail.com", domains)).toBe(false);
    expect(isCollegeEmail("asha@mail.college.edu", domains)).toBe(false);
    expect(isCollegeEmail("asha@college.edu.evil.com", domains)).toBe(false);
    expect(isCollegeEmail("asha@evilcollege.edu", domains)).toBe(false);
    expect(isCollegeEmail("asha@second.ac.in.evil.com", domains)).toBe(false);
  });
  it("rejects malformed addresses", () => {
    expect(isCollegeEmail("college.edu", domains)).toBe(false);
    expect(isCollegeEmail("a@b@college.edu", domains)).toBe(false);
    expect(isCollegeEmail("@college.edu", domains)).toBe(false);
    expect(isCollegeEmail("", domains)).toBe(false);
  });
  it("rejects everything when no domain is configured", () => {
    expect(isCollegeEmail("asha@college.edu", [])).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("returns the ten-digit mobile number, dropping spaces, dashes and +91", () => {
    expect(normalizePhone("9876543210")).toBe("9876543210");
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
  });
  it("returns null for anything that is not an Indian mobile number", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull();
    expect(normalizePhone("98765432101")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});
