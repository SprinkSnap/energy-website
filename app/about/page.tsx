import { SiteShell } from "@/components/layout/site-shell";
import { LogoWatermark } from "@/components/brand/watermark";
import { LinkButton } from "@/components/ui/link-button";
import { createMetadata } from "@/lib/seo";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

export const metadata = createMetadata({
  title: "About Energy Compliant Design",
  description:
    "Energy Compliant Design is an Ontario residential energy modeling practice focused on HOT2000, SB-12 compliance, EEDS, and permit packages.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <SiteShell>
      <section className="relative overflow-hidden bg-charcoal px-4 py-16 text-white sm:px-6 lg:px-8">
        <LogoWatermark opacity={0.1} />
        <div className="relative mx-auto max-w-7xl">
          <h1 className="text-4xl font-bold">About {SITE_NAME}</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/75">{SITE_TAGLINE}</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="prose prose-neutral max-w-none">
          <h2 className="text-2xl font-bold text-charcoal">A compliance practice built for production and custom homes</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Builders should not have to become HOT2000 operators to get a building permit. {SITE_NAME} exists to turn architectural drawings and a clear specification set into an SB-12-ready energy package — quickly, and with a review you can stand behind.
          </p>
          <p className="mt-4 leading-7 text-muted-foreground">
            We model in HOT2000, prepare the Energy Efficiency Design Summary, and assemble the reports municipalities ask for. When a house needs optimization or exceeds 22% window-to-wall ratio, we say so early and walk the options with you.
          </p>
        </div>
        <aside className="rounded-2xl border border-border bg-muted/40 p-6">
          <h2 className="text-lg font-semibold text-charcoal">What we will not do</h2>
          <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
            <li>We do not ask clients to calculate HOT2000 geometry.</li>
            <li>We do not hide pricing until the work is finished.</li>
            <li>We do not unlock permit documents before final payment.</li>
            <li>We do not treat over-22% WWR as a prescriptive checkbox.</li>
          </ul>
        </aside>
      </section>
      <section className="bg-electric-soft py-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-lg font-semibold text-charcoal">Work with a dedicated energy modeling team.</p>
          <LinkButton href="/contact" variant="brand">
            Contact us
          </LinkButton>
        </div>
      </section>
    </SiteShell>
  );
}
