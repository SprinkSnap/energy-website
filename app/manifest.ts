import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "ECD",
    description: SITE_TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: "#0B1220",
    theme_color: "#1B8CFF",
    icons: [
      {
        src: "/logo-icon.png",
        sizes: "256x256",
        type: "image/png",
      },
    ],
  };
}
