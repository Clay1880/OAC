import type { UserRole } from "./types";

/** Where a visitor belongs, given what we know about them. Pure so the proxy and pages agree. */
export function homeFor(
  role: UserRole | null,
  hasProfile: boolean,
  mustChangePassword = false,
  isActive = true,
): string {
  if (role === null && !hasProfile) return "/login";
  if (!hasProfile) return "/onboarding";
  if (!isActive) return "/login?inactive=1";
  if (mustChangePassword) return "/change-password";
  if (role === "admin") return "/admin";
  if (role === "staff") return "/staff";
  return "/";
}
