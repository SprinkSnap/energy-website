import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    "/services",
    "/how-it-works",
    "/about",
    "/contact",
    "/login",
    "/create-account",
    "/privacy",
    "/terms",
  ];

  return paths.map((path, index) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : 0.7,
  }));
}
