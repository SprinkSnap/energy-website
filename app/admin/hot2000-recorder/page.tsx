import { notFound } from "next/navigation";
import { isCatalogRecorderEnabled } from "@/lib/hot2000/catalog-recorder";
import { Hot2000RecorderClient } from "@/components/admin/hot2000-recorder-client";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "HOT2000 Catalog Recorder",
  description: "Developer-only HOT2000 Desktop catalog capture tools.",
  path: "/admin/hot2000-recorder",
  robots: privatePageRobots,
});

export default function Hot2000RecorderPage() {
  if (!isCatalogRecorderEnabled()) {
    notFound();
  }

  return <Hot2000RecorderClient />;
}
