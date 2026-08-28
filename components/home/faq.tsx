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
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-charcoal">What Ontario teams tell us</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Typical feedback from builders, designers, and technologists who use the
          portal for SB-12 packages.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              quote:
                "The portal made it obvious what we still needed to provide. The EEDS came back ready for the city.",
              name: "Production builder, GTA",
            },
            {
              quote:
                "We did not want to guess assemblies. The optimization route and options call saved a redesign.",
              name: "Custom home designer, Ottawa",
            },
            {
              quote:
                "Over 22% glass is usually a scramble. They modelled a path that still hit SB-12.",
              name: "Architectural technologist, Hamilton",
            },
          ].map((item) => (
            <blockquote key={item.name} className="surface-card p-6 text-sm leading-6 text-charcoal">
              <p>“{item.quote}”</p>
              <footer className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {item.name}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
