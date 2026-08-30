# Staging vs production

The site defaults to **staging** until the customer domain is purchased and a production deploy is configured.

## Staging (current default)

Set these **Cloudflare build environment variables**:

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_SITE_ENV` | `staging` (or omit — this is the default) |
| `NEXT_PUBLIC_SITE_URL` | `https://energy-website.che-1681.workers.dev` (your workers.dev URL) |

**Do not** connect the customer domain (`energycompliantdesign.ca`) to this Worker while staging.

Staging behaviour:

- Yellow **Staging preview** banner on all marketing pages
- `[Staging]` prefix in browser titles
- `noindex, nofollow` on all pages (robots.txt blocks all crawlers)
- Empty sitemap
- `X-Robots-Tag` header on workers.dev and localhost

## Production launch (after domain is purchased)

1. Purchase and configure the customer domain in Cloudflare
2. Update **build** environment variables:

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_SITE_ENV` | `production` |
| `NEXT_PUBLIC_SITE_URL` | `https://www.energycompliantdesign.ca` |

3. Redeploy the Worker
4. Attach the custom domain to the Worker
5. Verify robots/sitemap and remove staging banner

## Important

- Never set `NEXT_PUBLIC_SITE_ENV=production` until the customer domain is ready
- Keep `CONTACT_WEBHOOK_URL` configured for quote/contact forms on staging if you want lead capture during review
