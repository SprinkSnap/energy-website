# Energy Compliant Design

Marketing website and client portal for **Energy Compliant Design** — HOT2000 energy modeling, SB-12 compliance, EEDS, and 48-hour permit package delivery.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui
- React Hook Form + Zod
- Lucide icons

Auth and project storage use **Supabase** when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. Otherwise the portal falls back to browser `localStorage` for demos. See `docs/SUPABASE.md` and `docs/AUTH.md`.

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo portal login: `demo@energycompliantdesign.ca` / `Demo1234!`

### Supabase (recommended for production)

```bash
# .dev.vars
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Run `supabase/migrations/001_initial.sql` in your Supabase SQL editor. Full setup: `docs/SUPABASE.md`.

## Build

```bash
npm run build
npm start
```

## Deploy (Cloudflare Workers)

Staging is the **default** until the customer domain is purchased. See [docs/STAGING.md](docs/STAGING.md).

**Staging build variables (Cloudflare → Settings → Build environment variables):**

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_SITE_ENV` | `staging` |
| `NEXT_PUBLIC_SITE_URL` | `https://energy-website.che-1681.workers.dev` |

Do **not** attach the customer domain while staging.

Production is deployed with [OpenNext for Cloudflare](https://opennext.js.org/cloudflare). The worker serves the full Next.js marketing site and client portal at `/`, and the standalone HOT2000 editor at `/h2k-web-editor/`.

```bash
npm run deploy:cloudflare
```

For Cloudflare Workers Builds, set:

- **Build command:** `npm run build:cloudflare`
- **Deploy command:** `npx wrangler deploy`

Preview locally before deploying:

```bash
npm run preview:cloudflare
```

## Brand assets

Place the official logo files in `/public`:

- `public/energy-compliant-design-logo.png` — full wordmark logo (responsive in headers/footer)
- `public/logo.png` — same file at an alternate path
- `public/logo-icon.png` — cropped mark used for favicon, mobile nav, and watermarks

## HOT2000 web editor

`h2k-web-editor/` is the standalone browser prototype. During Cloudflare builds it is copied to `public/h2k-web-editor/` so it is available at `/h2k-web-editor/` alongside the Next.js app.

For local development with the editor:

```bash
npm run copy:h2k
npm run dev
```

Then open [http://localhost:3000/h2k-web-editor/](http://localhost:3000/h2k-web-editor/).
