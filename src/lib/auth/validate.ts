/** True when `email` is a single address on exactly `domain` (no subdomains). Mirrors the database guard. */
export function isCollegeEmail(email: string, domain: string): boolean {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 && parts[0] !== "" && parts[1] === domain.toLowerCase();
}

/** Ten-digit Indian mobile number from what the student typed, or null. Mirrors `complete_profile`. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "").replace(/^(\+91|91)(?=[6-9]\d{9}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
