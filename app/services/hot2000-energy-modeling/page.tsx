import { SERVICE_LANDINGS } from "@/lib/services-content";
import { ServiceLandingPage } from "@/components/services/service-landing-page";
import { createMetadata } from "@/lib/seo";

const service = SERVICE_LANDINGS.find((s) => s.slug === "hot2000-energy-modeling")!;

export const metadata = createMetadata({
  title: service.metaTitle,
  description: service.metaDescription,
  path: service.path,
});

export default function Hot2000EnergyModelingPage() {
  return <ServiceLandingPage service={service} />;
}
