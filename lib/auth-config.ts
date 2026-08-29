/** Demo/prototype auth configuration. Not production-grade security. */

/** Demo login is on by default for the prototype portal. Set NEXT_PUBLIC_DEMO_AUTH_ENABLED=false to disable. */
export function isDemoAuthEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_AUTH_ENABLED === "false") return false;
  return true;
}

export const AUTH_LIMITATIONS = `
Energy Compliant Design client auth is currently a browser-local prototype.

- Accounts and sessions are stored in localStorage
- Passwords are not hashed server-side
- Demo login is ${isDemoAuthEnabled() ? "enabled" : "disabled"} in this environment

Production requires a real identity provider and server-side data store.
See docs/AUTH.md for integration notes.
`.trim();
