import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { PUBLIC_SITEMAP_PATHS } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency:
      path === ""
        ? "weekly"
        : path.startsWith("/resources")
          ? "monthly"
          : "monthly",
    priority:
      path === ""
        ? 1
        : path.startsWith("/services/")
          ? 0.8
          : path.startsWith("/resources/")
            ? 0.75
            : path === "/services" || path === "/resources"
              ? 0.9
              : 0.7,
  }));
}
