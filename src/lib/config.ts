/** Campus-wide constants. Money is integer paise; all slot logic runs in campus time. */

export const CAMPUS_TZ = "Asia/Kolkata";

/** Minutes after a slot starts that staff hold an uncollected order before it can be marked no-show. */
export const NO_SHOW_HOLD_MINUTES = 15;

/** Orders for a slot close this many minutes before the slot starts. */
export const ORDER_CUTOFF_MINUTES = 5;

/**
 * Presentation fallback: a fixed demo student can sign in with an ID and password when the OTP
 * email is not available. Server only (not NEXT_PUBLIC_), and off unless DEMO_LOGIN=true, so a
 * production deployment never exposes it.
 */
export const isDemoLoginEnabled = () => process.env.DEMO_LOGIN === "true";
