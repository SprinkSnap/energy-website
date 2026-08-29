# Authentication (prototype)

The client portal currently uses **browser-local prototype authentication**. This is suitable for demos and UX testing only.

## Current behaviour

- Accounts are stored in `localStorage` under `ecd-users`
- Sessions are stored in `localStorage` under `ecd-session`
- Passwords are stored in plaintext in the browser
- Demo login is enabled by default for the prototype portal. Set `NEXT_PUBLIC_DEMO_AUTH_ENABLED=false` to disable.

## Production requirements

Before production launch, replace with:

1. A server-side identity provider (e.g. Auth.js, Clerk, Supabase Auth, or custom API)
2. Hashed passwords or passwordless auth
3. HTTP-only session cookies
4. Server-side project and document storage (not `localStorage`)

## Environment variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_DEMO_AUTH_ENABLED` | Set `false` to hide the one-click demo login button |

## Quote intake

Quote/contact lead data is **not** stored in `localStorage`. Submissions are delivered server-side via webhook when configured.

Account creation can prefill name/email/company/phone from quote intake using `sessionStorage` only for the current browser session.
