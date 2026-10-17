/** Campus-wide constants. Money is integer paise; all slot logic runs in campus time. */

export const CAMPUS_TZ = "Asia/Kolkata";

/** Minutes after a slot starts that staff hold an uncollected order before it can be marked no-show. */
export const NO_SHOW_HOLD_MINUTES = 15;

/** Orders for a slot close this many minutes before the slot starts. */
export const ORDER_CUTOFF_MINUTES = 5;

/**
 * Email domain students must sign in with (e.g. `college.edu`), or undefined when unset.
 * Referenced statically so Next.js can inline it into the client bundle.
 */
export const COLLEGE_EMAIL_DOMAIN: string | undefined =
  process.env.NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN?.trim().replace(/^@/, "").toLowerCase() ||
  undefined;

/** Use where the domain is enforced: fails loudly instead of letting every address through. */
export function requireCollegeEmailDomain(): string {
  if (!COLLEGE_EMAIL_DOMAIN) {
    throw new Error(
      "NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN is not set. Add it to .env.local (see .env.example).",
    );
  }
  return COLLEGE_EMAIL_DOMAIN;
}
