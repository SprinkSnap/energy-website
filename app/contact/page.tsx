import { SiteShell } from "@/components/layout/site-shell";
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
      <section className="bg-charcoal px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-4xl font-bold">Contact</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            Tell us about the model, municipality, and timeline. For active files, use the client portal.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
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
