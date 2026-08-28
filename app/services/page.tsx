import { Calculator, FileCheck2, Home, Layers, Settings2, Shield, Wind } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHero } from "@/components/layout/page-hero";
import { LinkButton } from "@/components/ui/link-button";
import { createMetadata, defaultKeywords } from "@/lib/seo";
import { SITE_NAME } from "@/lib/constants";

export const metadata = createMetadata({
  title: "Energy Modeling & SB-12 Compliance Services",
  description:
    "HOT2000 energy modeling, SB-12 compliance, EEDS preparation, building takeoff, permit package support, and custom over-22% WWR projects from Energy Compliant Design.",
  path: "/services",
  keywords: defaultKeywords,
});

const services = [
  {
    icon: Calculator,
    title: "HOT2000 Energy Modeling",
    body: "We build proposed and code/reference HOT2000 models from architectural drawings and confirmed specifications, then issue the reports municipalities expect.",
  },
  {
    icon: Shield,
    title: "SB-12 Compliance",
    body: "Performance-path analysis against Ontario Supplementary Standard SB-12 so the house can be permitted with a defensible energy package.",
  },
  {
    icon: FileCheck2,
    title: "EEDS Preparation",
    body: "Energy Efficiency Design Summary forms prepared to match the modelled assemblies, mechanicals, and compliance path.",
  },
  {
    icon: Home,
    title: "Building Takeoff",
    body: "Volume, exterior walls, windows, doors, ceilings, exposed floors, foundations, and window-to-wall ratio — calculated for you.",
  },
  {
    icon: Layers,
    title: "Permit Package Support",
    body: "A coordinated set of reports and forms ready to include with the building permit application.",
  },
  {
    icon: Settings2,
    title: "Compliance Optimization",
    body: "When the first pass does not close, we test practical envelope and mechanical options and walk you through the trade-offs.",
  },
  {
    icon: Wind,
    title: "Custom / Over-22%-WWR Projects",
    body: "High-glazing homes need a performance path. We review Path 1 (known specs) or Path 2 (need help) and model a compliant solution.",
  },
];

export default function ServicesPage() {
  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: services.map((service, index) => ({
      "@type": "Service",
      position: index + 1,
      name: service.title,
      description: service.body,
      provider: { "@type": "Organization", name: SITE_NAME },
      areaServed: "Ontario",
    })),
  };

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <PageHero
        eyebrow="Services"
        title="Energy modeling services for SB-12, HOT2000, and EEDS"
        description="A focused residential compliance practice. You upload drawings and confirm specifications. We return a permit-ready energy package."
      />
      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
        {services.map((service) => (
          <article key={service.title} className="surface-card p-6">
            <service.icon className="size-6 text-electric" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold text-charcoal">{service.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{service.body}</p>
          </article>
        ))}
      </section>
      <section className="bg-electric-soft py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 className="text-2xl font-bold text-charcoal">Ready to start a project?</h2>
            <p className="text-sm text-muted-foreground">Create an account and open the SB-12 wizard.</p>
          </div>
          <LinkButton href="/create-account" variant="brand" size="lg">
            Start a project
          </LinkButton>
        </div>
      </section>
    </SiteShell>
  );
}
