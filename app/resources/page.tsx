import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/layout/site-shell";
import { PageHero } from "@/components/layout/page-hero";
import { TrackedLinkButton } from "@/components/analytics/tracked-link";
import { RESOURCE_ARTICLES } from "@/lib/resources-content";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Energy Compliance Guides for Ontario Builders",
  description:
    "Expert guides on HOT2000 drawings, EEDS, SB-12 performance paths, window-to-wall ratio, and permit packages for Ontario residential projects.",
  path: "/resources",
});

export default function ResourcesPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Resources"
        title="Guides for Ontario residential energy compliance"
        description="Practical answers on HOT2000, SB-12, EEDS, and permit packages — written for builders, designers, and technologists."
      />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCE_ARTICLES.map((article) => (
            <Link
              key={article.slug}
              href={article.path}
              className="group surface-card flex flex-col p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
            >
              <p className="text-xs font-semibold tracking-wide text-electric uppercase">
                {article.category}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-charcoal group-hover:text-electric">
                {article.title}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                {article.intro}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-electric">
                Read guide <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="bg-electric-soft py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 className="text-xl font-bold text-charcoal">Ready to start a project?</h2>
            <p className="text-sm text-muted-foreground">
              Request a fixed quote — no account required to begin.
            </p>
          </div>
          <TrackedLinkButton
            href="/quote"
            variant="brand"
            size="lg"
            className="min-h-11 w-full sm:w-auto"
            event="homepage_primary_cta_click"
            eventProperties={{ location: "resources_hub" }}
          >
            Get an SB-12 quote
          </TrackedLinkButton>
        </div>
      </section>
    </SiteShell>
  );
}
