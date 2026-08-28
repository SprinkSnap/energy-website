import { SERVICE_LANDINGS } from "@/lib/services-content";
import { ServiceLandingPage } from "@/components/services/service-landing-page";
import { createMetadata } from "@/lib/seo";

const service = SERVICE_LANDINGS.find((s) => s.slug === "sb-12-compliance")!;

export const metadata = createMetadata({
  title: service.metaTitle,
  description: service.metaDescription,
  path: service.path,
});

export default function Sb12CompliancePage() {
  return <ServiceLandingPage service={service} />;
}
