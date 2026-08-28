import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHero } from "@/components/layout/page-hero";
import { TrackedLinkButton } from "@/components/analytics/tracked-link";
import type { ServiceLanding } from "@/lib/services-content";
import { SITE_NAME } from "@/lib/constants";

export function ServiceLandingPage({ service }: { service: ServiceLanding }) {
  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.h1,
    description: service.intro,
    provider: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Ontario",
    },
    serviceType: service.title,
  };

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <PageHero eyebrow={service.eyebrow} title={service.h1} description={service.intro} />

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <article>
            <h2 className="text-xl font-bold text-charcoal">Who this is for</h2>
            <ul className="mt-4 grid gap-2">
              {service.whoFor.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-green" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h2 className="text-xl font-bold text-charcoal">What you provide</h2>
            <ul className="mt-4 grid gap-2">
              {service.inputs.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-electric" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="bg-muted/50 py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold text-charcoal sm:text-2xl">Deliverables</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {service.outputs.map((item) => (
              <li key={item} className="surface-card p-4 text-sm leading-6 text-charcoal">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h2 className="text-xl font-bold text-charcoal sm:text-2xl">How it works</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {service.process.map((step, index) => (
            <li key={step.title} className="surface-card p-5">
              <p className="text-xs font-semibold tracking-[0.16em] text-electric uppercase">
                Step {index + 1}
              </p>
              <h3 className="mt-2 font-semibold text-charcoal">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {service.faq.length > 0 ? (
        <section className="border-t border-border bg-white py-10 sm:py-12">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold text-charcoal">Common questions</h2>
            <dl className="mt-6 grid gap-4">
              {service.faq.map((item) => (
                <div key={item.question} className="surface-card p-5">
                  <dt className="font-semibold text-charcoal">{item.question}</dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      <section className="bg-electric-soft py-10 sm:py-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 className="text-xl font-bold text-charcoal sm:text-2xl">Ready to start?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload drawings and receive a fixed quote before deposit.
            </p>
            <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Related services">
              {service.relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-medium text-electric hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <TrackedLinkButton
            href="/create-account"
            variant="brand"
            size="lg"
            className="min-h-11 w-full sm:w-auto"
            event="homepage_primary_cta_click"
            eventProperties={{ location: `service_${service.slug}` }}
          >
            Start with my drawings
          </TrackedLinkButton>
        </div>
      </section>
    </SiteShell>
  );
}
