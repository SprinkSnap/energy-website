import { SERVICE_LANDINGS } from "@/lib/services-content";
import { ServiceLandingPage } from "@/components/services/service-landing-page";
import { createMetadata } from "@/lib/seo";

const service = SERVICE_LANDINGS.find((s) => s.slug === "eeds")!;

export const metadata = createMetadata({
  title: service.metaTitle,
  description: service.metaDescription,
  path: service.path,
});

export default function EedsPage() {
  return <ServiceLandingPage service={service} />;
}
