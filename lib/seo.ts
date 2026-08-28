import type { Metadata } from "next";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/constants";

export function createMetadata({
  title,
  description,
  path = "/",
  keywords,
}: {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
}): Metadata {
  const url = `${SITE_URL}${path}`;
  const fullTitle = title.includes(SITE_NAME)
    ? title
    : `${title} | ${SITE_NAME}`;

  return {
    title: fullTitle,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_CA",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
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
  title: `${SITE_NAME} | Permit-ready SB-12 packages in 48 hours`,
  description: `Permit-ready SB-12 packages in 48 hours. ${SITE_TAGLINE} Professional HOT2000 energy modeling, SB-12 compliance, EEDS preparation, and permit packages for Ontario residential projects.`,
  path: "/",
  keywords: defaultKeywords,
});
