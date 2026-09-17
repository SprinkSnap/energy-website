# Supabase setup

Production auth and per-client project storage use **Supabase** when environment variables are configured. Without them, the site falls back to browser `localStorage` (demo/staging only).

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. Open **SQL Editor** and run `supabase/migrations/001_initial.sql`.
3. Copy **Project URL** and **anon public key** from **Settings → API**.

## 2. Environment variables

Supabase auth requires **both** build-time and runtime environment variables on Cloudflare/OpenNext. The values must match.

### Local development

Add to `.dev.vars`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Cloudflare Workers (OpenNext)

Set the same variables in **both** places:

| Scope | Variables |
|-------|-----------|
| **Build environment** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Runtime environment** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Example project URL (replace anon key with your dashboard value — never commit it):

```
NEXT_PUBLIC_SUPABASE_URL=https://fxefdgrbtczowzocxwkr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase Settings → API>
```

`wrangler.jsonc` includes `"keep_vars": true` so dashboard/runtime variables are preserved across deploys. You still need the Supabase variables present in the Cloudflare environment before the first deploy after enabling auth.

### Staging diagnostics

On staging (`NEXT_PUBLIC_SITE_ENV` not `production`), `GET /api/diagnostics/supabase` returns safe booleans only:

```json
{
  "configured": true,
  "urlConfigured": true,
  "anonKeyConfigured": true,
  "urlFormatValid": true,
  "authReachable": true
}
```

Public marketing pages (for example `/create-account`, `/login`, `/about`) do **not** call `supabase.auth.getUser()` in middleware. Session refresh runs only on `/portal`, `/admin`, and `/auth` routes.

No keys, tokens, or cookies are exposed.

Optional (server-only, for admin scripts — not required for client portal RLS):

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 3. Auth settings (Supabase dashboard)

- **Authentication → URL configuration**
  - Site URL: your staging or production URL
  - Redirect URLs: `https://your-domain/auth/callback`
- For faster staging, you may disable **Confirm email** under Providers → Email.
- Add the demo user manually (or via SQL) if using one-click demo login:
  - Email: `demo@energycompliantdesign.ca`
  - Password: `Demo1234!`
  - User metadata: `{ "name": "Jordan Patel", "company": "Wellington Homes" }`

## 4. Database schema

| Table | Purpose |
|-------|---------|
| `profiles` | Client name, company, phone (linked to `auth.users`) |
| `projects` | One row per SB-12 project; full wizard state in `data` jsonb |

**Row Level Security** ensures each client only reads/writes their own rows (`auth.uid() = user_id`).

## 5. What is stored where

| Data | Storage |
|------|---------|
| Accounts & sessions | Supabase Auth (HTTP-only cookies via `@supabase/ssr`) |
| Projects | `projects` table per `user_id` |
| Drawings | Metadata in project JSON today; file bytes → future Supabase Storage bucket |
| Quote/contact leads | Webhook (unchanged) |

## 6. Responsive UI

Auth and portal pages already use responsive layouts (mobile cards, tablet grid, desktop table). No separate mobile app — the same Supabase-backed portal works on all breakpoints.

## 7. Staff roles (owner / employee)

Run `supabase/migrations/002_admin_roles.sql` after the initial migration.

| Role | Access |
|------|--------|
| `client` | Default — own projects only |
| `employee` | Client account list, open accounts, edit client projects |
| `owner` | Everything employees can do, plus **account description** notes |

Assign roles in Supabase SQL:

```sql
update public.profiles set role = 'owner' where email = 'you@energycompliantdesign.ca';
update public.profiles set role = 'employee' where email = 'staff@energycompliantdesign.ca';
```

Staff portal: `/portal/admin`

## 8. Verify

1. Set env vars and run `npm run dev`
2. Create account at `/create-account`
3. Add a project in `/portal`
4. Sign in on another device/browser with the same account — projects should appear
5. Delete a draft before deposit — row removed from Supabase
