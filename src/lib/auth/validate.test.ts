import { describe, expect, it } from "vitest";
import { isCollegeEmail, normalizePhone } from "./validate";

describe("isCollegeEmail", () => {
  it("accepts an address on the college domain, ignoring case and padding", () => {
    expect(isCollegeEmail("asha@college.edu", "college.edu")).toBe(true);
    expect(isCollegeEmail("  Asha.Rao@College.EDU ", "college.edu")).toBe(true);
  });
  it("rejects other domains, subdomains and look-alikes", () => {
    expect(isCollegeEmail("asha@gmail.com", "college.edu")).toBe(false);
    expect(isCollegeEmail("asha@mail.college.edu", "college.edu")).toBe(false);
    expect(isCollegeEmail("asha@college.edu.evil.com", "college.edu")).toBe(false);
    expect(isCollegeEmail("asha@evilcollege.edu", "college.edu")).toBe(false);
  });
  it("rejects malformed addresses", () => {
    expect(isCollegeEmail("college.edu", "college.edu")).toBe(false);
    expect(isCollegeEmail("a@b@college.edu", "college.edu")).toBe(false);
    expect(isCollegeEmail("@college.edu", "college.edu")).toBe(false);
    expect(isCollegeEmail("", "college.edu")).toBe(false);
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
