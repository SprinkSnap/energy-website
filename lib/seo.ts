import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { IS_STAGING, stagingNoIndexRobots } from "@/lib/site-env";

export const privatePageRobots: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

/** Applied to all public marketing pages while staging. */
export const stagingPageRobots: Metadata["robots"] = stagingNoIndexRobots;

function brandedTitle(title: string) {
  return `${title} | ${SITE_NAME}`;
}

function resolveRobots(robots?: Metadata["robots"]): Metadata["robots"] | undefined {
  if (robots) return robots;
  if (IS_STAGING) return stagingPageRobots;
  return undefined;
}

export function createMetadata({
  title,
  description,
  path = "/",
  keywords,
  robots,
}: {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  robots?: Metadata["robots"];
}): Metadata {
  const url = `${SITE_URL}${path}`;
  const ogTitle = brandedTitle(title);
  const resolvedRobots = resolveRobots(robots);
  const stagingTitle = IS_STAGING ? `[Staging] ${title}` : title;
  const stagingOgTitle = brandedTitle(stagingTitle);

  return {
    title: stagingTitle,
    description,
    keywords,
    alternates: { canonical: url },
    robots: resolvedRobots,
    openGraph: {
      title: stagingOgTitle,
      description,
      url,
      siteName: IS_STAGING ? `${SITE_NAME} (Staging)` : SITE_NAME,
      locale: "en_CA",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: stagingOgTitle,
      description,
    },
  };
}

export const defaultKeywords = [
  "Energy Compliant Design",
  "SB-12 compliance",
  "HOT2000 energy modeling",
  "EEDS",
  "energy efficiency design summary",
  "permit package",
  "energy modeling services",
  "code compliance",
  "residential energy compliance",
  "Ontario building code energy",
];

export const homeMetadata = createMetadata({
  title: "SB-12 Compliance & HOT2000 Energy Modeling Ontario",
  description:
    "Permit-ready SB-12, HOT2000 and EEDS packages for Ontario residential projects. Complete Route 1 projects are typically delivered within 48 business hours.",
  path: "/",
  keywords: defaultKeywords,
});

export const PUBLIC_SITEMAP_PATHS = [
  "",
  "/services",
  "/services/sb-12-compliance",
  "/services/hot2000-energy-modeling",
  "/services/eeds",
  "/services/high-window-to-wall-ratio",
  "/how-it-works",
  "/about",
  "/contact",
  "/resources",
  "/resources/what-drawings-are-required-for-hot2000",
  "/resources/what-is-an-eeds",
  "/resources/sb12-performance-vs-prescriptive",
  "/resources/window-to-wall-ratio-sb12",
  "/resources/sb12-permit-package",
  "/privacy",
  "/terms",
] as const;
