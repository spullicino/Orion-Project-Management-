/**
 * "Keep me signed in on this device".
 * When it's off we set this marker cookie (itself ending when the browser closes)
 * and save Supabase's sign-in cookies without an expiry date, so the browser
 * forgets them when it is closed.
 */
export const SESSION_ONLY_COOKIE = "orion-session-only";

type CookieOptions = { maxAge?: number; expires?: Date | number | string; [key: string]: unknown };

export function cookieOptionsFor<T extends CookieOptions | undefined>(value: string, options: T, sessionOnly: boolean): T {
  // Never touch cookies that are being removed (empty value / maxAge 0): that's how sign-out works.
  if (!sessionOnly || !options || !value) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest as T;
}
