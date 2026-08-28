import { SERVICE_LANDINGS } from "@/lib/services-content";
import { ServiceLandingPage } from "@/components/services/service-landing-page";
import { createMetadata } from "@/lib/seo";

const service = SERVICE_LANDINGS.find((s) => s.slug === "high-window-to-wall-ratio")!;

export const metadata = createMetadata({
  title: service.metaTitle,
  description: service.metaDescription,
  path: service.path,
});

export default function HighWwrPage() {
  return <ServiceLandingPage service={service} />;
}
