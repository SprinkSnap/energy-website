import Link from "next/link";
import type { ResourceArticle } from "@/lib/resources-content";
import { SITE_NAME } from "@/lib/constants";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { TrackedLinkButton } from "@/components/analytics/tracked-link";

export function ResourceArticlePage({ article }: { article: ResourceArticle }) {
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    about: article.category,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <div className="border-b border-border bg-white">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Resources", href: "/resources" },
              { label: article.title },
            ]}
          />
          <p className="mt-4 text-sm font-semibold tracking-wide text-electric uppercase">
            {article.category}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-charcoal sm:text-4xl">{article.title}</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{article.intro}</p>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="prose prose-neutral max-w-none">
          {article.sections.map((section) => (
            <section key={section.heading} className="mb-8">
              <h2 className="text-xl font-bold text-charcoal">{section.heading}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>

        {article.faq?.length ? (
          <section className="mt-10 border-t border-border pt-8">
            <h2 className="text-lg font-bold text-charcoal">Common questions</h2>
            <dl className="mt-4 grid gap-4">
              {article.faq.map((item) => (
                <div key={item.question}>
                  <dt className="font-semibold text-charcoal">{item.question}</dt>
                  <dd className="mt-1 text-sm leading-6 text-muted-foreground">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section className="mt-10 rounded-2xl bg-electric-soft p-6">
          <h2 className="text-lg font-bold text-charcoal">Related services</h2>
          <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2" aria-label="Related services">
            {article.relatedServices.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-semibold text-electric hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <TrackedLinkButton
            href="/quote"
            variant="brand"
            className="mt-5 min-h-11"
            event="homepage_primary_cta_click"
            eventProperties={{ location: `resource_${article.slug}` }}
          >
            Get an SB-12 quote
          </TrackedLinkButton>
        </section>

        <p className="mt-8 text-xs leading-5 text-muted-foreground">
          This guide is general information for Ontario residential energy compliance. Municipal
          requirements can vary. Confirm submission details with your local building department.
        </p>
      </article>
    </>
  );
}
