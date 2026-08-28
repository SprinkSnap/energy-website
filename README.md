# Energy Compliant Design

Marketing website and client portal for **Energy Compliant Design** — HOT2000 energy modeling, SB-12 compliance, EEDS, and 48-hour permit package delivery.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui
- React Hook Form + Zod
- Lucide icons

Auth, project storage, file uploads, and payments are **client-side placeholders** (localStorage). Comments in the code mark where a real backend, identity provider, object storage, and payment processor should be connected.

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo portal login: `demo@energycompliantdesign.ca` / `Demo1234!`

## Build

```bash
npm run build
npm start
```

## Brand assets

Place the official logo files in `/public`:

- `public/branding/energy-compliant-design-logo.png` — supplied brand logo
- `public/logo.png` — same file at the site root
- `public/logo-icon.png` — cropped mark used for favicon and watermarks

## Existing HOT2000 editor

`h2k-web-editor/` is the standalone browser prototype previously served by Wrangler. It is unchanged and not part of the Next.js app.
