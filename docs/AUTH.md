# Authentication

The client portal supports **Supabase Auth** when configured, with a **localStorage fallback** for demos without Supabase keys.

## Supabase (production)

When `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set:

- Sign up, sign in, sign out, and password reset use Supabase
- Sessions are stored in **HTTP-only cookies** (refreshed in `middleware.ts`)
- User profiles live in the `profiles` table
- See `docs/SUPABASE.md` for setup

## Local fallback (staging/demo)

Without Supabase env vars:

- Accounts in `localStorage` (`ecd-users`) — **not secure**
- Sessions in `localStorage` (`ecd-session`)
- Demo login enabled by default (`NEXT_PUBLIC_DEMO_AUTH_ENABLED=false` to disable)

## Demo login

- Email: `demo@energycompliantdesign.ca`
- Password: `Demo1234!`
- With Supabase: create this user in your Supabase project first

## Environment variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe for browser) |
| `NEXT_PUBLIC_DEMO_AUTH_ENABLED` | Set `false` to hide demo login button |

## Quote intake

Quote/contact data is delivered via webhook when configured — not stored in auth tables.

Account creation can prefill from quote intake via `sessionStorage` (`lib/quote/prefill.ts`).
