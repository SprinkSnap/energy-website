import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { IS_STAGING } from "@/lib/site-env";

export default function robots(): MetadataRoute.Robots {
  if (IS_STAGING) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      host: SITE_URL,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/login",
        "/create-account",
        "/forgot-password",
        "/quote",
        "/portal/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
