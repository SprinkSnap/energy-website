import { SiteShell } from "@/components/layout/site-shell";
import { PageHero } from "@/components/layout/page-hero";
import { ContactDetails, ContactForm } from "@/components/contact/contact-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Contact Energy Compliant Design",
  description:
    "Contact Energy Compliant Design for HOT2000 energy modeling, SB-12 compliance, EEDS, and permit package questions.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <SiteShell>
      <PageHero
        title="Contact"
        description="Tell us about the model, municipality, and timeline. For active files, use the client portal."
      />
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
        <div className="rounded-3xl border border-border/80 bg-white p-6 shadow-[0_1px_2px_rgba(11,18,32,0.04),0_12px_32px_rgba(11,18,32,0.05)] sm:p-8">
          <h2 className="text-xl font-semibold text-charcoal">Send a message</h2>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>
        <ContactDetails />
      </section>
    </SiteShell>
  );
}
