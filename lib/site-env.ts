/**
 * Site environment — defaults to staging until the customer domain is purchased
 * and NEXT_PUBLIC_SITE_ENV=production is set for the production deploy.
 */
export const SITE_ENV = process.env.NEXT_PUBLIC_SITE_ENV ?? "staging";

export const IS_STAGING = SITE_ENV !== "production";

export const IS_PRODUCTION = SITE_ENV === "production";

/** Canonical production URL — only used when IS_PRODUCTION is true (unless overridden). */
export const PRODUCTION_SITE_URL = "https://www.energycompliantdesign.ca";

export const stagingNoIndexRobots = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
} as const;
