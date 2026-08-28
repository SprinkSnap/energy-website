import Link from "next/link";
import { ArrowRight, Home, Layers, Settings2 } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHero } from "@/components/layout/page-hero";
import { TrackedLinkButton } from "@/components/analytics/tracked-link";
import { createMetadata, defaultKeywords } from "@/lib/seo";
import { SERVICE_LANDINGS } from "@/lib/services-content";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

export const metadata = createMetadata({
  title: "Energy Modeling & SB-12 Compliance Services",
  description:
    "HOT2000 energy modeling, SB-12 compliance, EEDS preparation, building takeoff, permit package support, and custom over-22% WWR projects from Energy Compliant Design.",
  path: "/services",
  keywords: defaultKeywords,
});

const additionalServices = [
  {
    icon: Home,
    title: "Building Takeoff",
    body: "Volume, exterior walls, windows, doors, ceilings, exposed floors, foundations, and window-to-wall ratio — calculated for you.",
    href: "/services/hot2000-energy-modeling",
  },
  {
    icon: Layers,
    title: "Permit Package Support",
    body: "A coordinated set of reports and forms ready to include with the building permit application.",
    href: "/services/sb-12-compliance",
  },
  {
    icon: Settings2,
    title: "Compliance Optimization",
    body: "When the first pass does not close, we test practical envelope and mechanical options and walk you through the trade-offs.",
    href: "/how-it-works",
  },
];

export default function ServicesPage() {
  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: SERVICE_LANDINGS.map((service, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}${service.path}`,
      name: service.title,
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
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h2 className="text-xl font-bold text-charcoal sm:text-2xl">Core services</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {SERVICE_LANDINGS.map((service) => (
            <Link
              key={service.slug}
              href={service.path}
              className="group surface-card block p-6 transition-colors hover:border-electric/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
            >
              <service.icon className="size-6 text-electric" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold text-charcoal group-hover:text-electric">
                {service.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{service.intro}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-electric">
                View service details <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="bg-muted/50 py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold text-charcoal sm:text-2xl">Related support</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {additionalServices.map((service) => (
              <Link
                key={service.title}
                href={service.href}
                className="group surface-card block p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
              >
                <service.icon className="size-6 text-electric" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-charcoal">{service.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{service.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-electric-soft py-10 sm:py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 className="text-2xl font-bold text-charcoal">Ready to start a project?</h2>
            <p className="text-sm text-muted-foreground">
              Create an account and open the SB-12 wizard with {SITE_NAME}.
            </p>
          </div>
          <TrackedLinkButton
            href="/create-account"
            variant="brand"
            size="lg"
            className="min-h-11 w-full sm:w-auto"
            event="homepage_primary_cta_click"
            eventProperties={{ location: "services_hub" }}
          >
            Start with my drawings
          </TrackedLinkButton>
        </div>
      </section>
    </SiteShell>
  );
}
