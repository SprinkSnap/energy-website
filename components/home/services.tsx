import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TrackedLink } from "@/components/analytics/tracked-link";
import { HOME_SERVICE_CARDS } from "@/lib/services-content";
import { cn } from "@/lib/utils";

export function HomeServices() {
  return (
    <section className="bg-muted/50 py-12 sm:py-16 lg:py-20" aria-labelledby="services-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-electric uppercase">Services</p>
            <h2 id="services-heading" className="mt-2 text-2xl font-bold text-charcoal sm:text-3xl">
              Residential energy compliance, end to end
            </h2>
          </div>
          <Link
            href="/services"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-electric hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
          >
            View all services <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {HOME_SERVICE_CARDS.map((service) => (
            <TrackedLink
              key={service.title}
              href={service.href}
              event="service_card_click"
              eventProperties={{ service: service.title }}
              className={cn(
                "group surface-card block p-5 transition-colors",
                "hover:border-electric/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric",
              )}
            >
              <service.icon className="size-6 text-electric" aria-hidden />
              <h3 className="mt-3 text-base font-semibold text-charcoal group-hover:text-electric sm:text-lg">
                {service.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {service.description}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-electric">
                Learn more <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </TrackedLink>
          ))}
        </div>
      </div>
    </section>
  );
}
