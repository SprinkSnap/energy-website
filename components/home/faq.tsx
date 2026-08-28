import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ_ITEMS, SITE_NAME } from "@/lib/constants";

export function HomeFaq() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <section className="bg-muted/50 py-16 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-charcoal">Frequently asked questions</h2>
        <p className="mt-2 text-muted-foreground">
          Straight answers on SB-12, HOT2000, EEDS, and how {SITE_NAME} delivers
          permit packages.
        </p>
        <Accordion className="surface-card mt-8 px-4">
          {FAQ_ITEMS.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger className="py-4 text-base">{item.question}</AccordionTrigger>
              <AccordionContent className="leading-6 text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export function HomeTestimonials() {
  return (
    <section className="bg-white py-12 sm:py-16 lg:py-20" aria-labelledby="testimonials-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="testimonials-heading" className="text-2xl font-bold text-charcoal sm:text-3xl">
          Example client scenarios
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Illustrative feedback based on common project types — not verified
          customer endorsements. Replace with named testimonials when available.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {[
            {
              quote:
                "The portal made it obvious what we still needed to provide. The EEDS came back ready for the city.",
              label: "Production builder, GTA",
            },
            {
              quote:
                "We did not want to guess assemblies. The optimization route and options call saved a redesign.",
              label: "Custom home designer, Ottawa",
            },
            {
              quote:
                "Over 22% glass is usually a scramble. They modelled a path that still hit SB-12.",
              label: "Architectural technologist, Hamilton",
            },
          ].map((item) => (
            <figure key={item.label} className="surface-card p-5 text-sm leading-6 text-charcoal sm:p-6">
              <blockquote>
                <p>&ldquo;{item.quote}&rdquo;</p>
              </blockquote>
              <figcaption className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {item.label} · illustrative
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
