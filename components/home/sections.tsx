import Link from "next/link";
import { CheckCircle2, Clock3 } from "lucide-react";
import { LogoWatermark } from "@/components/brand/watermark";
import { TrackedLinkButton } from "@/components/analytics/tracked-link";
import { LinkButton } from "@/components/ui/link-button";

const routes = [
  {
    n: "Route 1",
    title: "I Know My Building Specifications",
    body: "Envelope and mechanical specs are already defined.",
    bestFor: "Production and repeat models",
    need: "Drawings + confirmed specs",
    time: "48-hour package after deposit",
    href: "/how-it-works",
  },
  {
    n: "Route 2",
    title: "Custom (Optimization)",
    body: "Need help selecting a compliant assembly mix.",
    bestFor: "Custom homes still deciding assemblies",
    need: "Drawings + a kickoff call",
    time: "Structured review, then proposal",
    href: "/how-it-works",
  },
  {
    n: "Route 3",
    title: "Over 22% Window-to-Wall Ratio",
    body: "Prescriptive packages generally do not apply above 22% WWR.",
    bestFor: "High-glazing elevations",
    need: "Drawings + Path 1 or Path 2",
    time: "Performance-path modelling",
    href: "/services/high-window-to-wall-ratio",
  },
];

export function HomeHowItWorks() {
  return (
    <section className="bg-white py-12 sm:py-16 lg:py-20" aria-labelledby="routes-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold tracking-wide text-electric uppercase">Choose a route</p>
        <h2 id="routes-heading" className="mt-2 text-2xl font-bold text-charcoal sm:text-3xl">
          Three clear project routes
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Pick the path that matches how decided the house already is. We handle
          takeoff, modelling, and the permit package.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {routes.map((route) => (
            <article key={route.n} className="surface-card flex flex-col p-5 sm:p-6">
              <p className="text-xs font-semibold tracking-wider text-electric uppercase">
                {route.n}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-charcoal sm:text-xl">{route.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{route.body}</p>
              <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Best for
                  </dt>
                  <dd className="mt-0.5 text-charcoal">{route.bestFor}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    You&apos;ll need
                  </dt>
                  <dd className="mt-0.5 text-charcoal">{route.need}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Timing
                  </dt>
                  <dd className="mt-0.5 text-charcoal">{route.time}</dd>
                </div>
              </dl>
              <Link
                href={route.href}
                className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-electric hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
              >
                Learn more about {route.n}
              </Link>
            </article>
          ))}
        </div>
        <div className="mt-6 sm:mt-8">
          <TrackedLinkButton
            href="/how-it-works"
            variant="outline"
            event="how_it_works_click"
            eventProperties={{ location: "routes" }}
          >
            See the full process
          </TrackedLinkButton>
        </div>
      </div>
    </section>
  );
}

export function HomeWhyChoose() {
  const items = [
    {
      title: "Specialists, not a generic portal",
      body: "Every model is reviewed by Energy Compliant Design — not auto-generated and left unverified.",
    },
    {
      title: "You keep the drawings. We take the geometry.",
      body: "Building volume, wall areas, glazing, and WWR are calculated from your architectural set.",
    },
    {
      title: "Transparent status",
      body: "From draft to deposit to unlocked documents, the portal shows exactly where the project stands.",
    },
  ];
  return (
    <section className="bg-muted/50 py-12 sm:py-16 lg:py-20" aria-labelledby="why-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="why-heading" className="text-2xl font-bold text-charcoal sm:text-3xl">
          Why builders choose us
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {items.map((item) => (
            <article key={item.title} className="rounded-2xl bg-charcoal p-5 text-white sm:p-6">
              <h3 className="text-base font-semibold sm:text-lg">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/70">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeTrust() {
  return (
    <section className="relative overflow-hidden bg-electric-soft py-10 sm:py-12 lg:py-14">
      <LogoWatermark opacity={0.1} blend="normal" />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-5 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-8">
        <div className="flex items-start gap-4">
          <Clock3 className="size-9 shrink-0 text-electric sm:size-10" aria-hidden />
          <div>
            <h2 className="text-xl font-bold text-charcoal sm:text-2xl">
              Compliance you can stand behind at the counter
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Known-specification projects move quickly. Optimization and over-22%
              WWR work follow a structured review so the model stays defensible.
            </p>
          </div>
        </div>
        <LinkButton href="/contact" variant="brand" size="lg" className="min-h-11 w-full sm:w-auto">
          Talk to a modeller
        </LinkButton>
      </div>
    </section>
  );
}

export function HomePortalPreview() {
  return (
    <section className="bg-white py-12 sm:py-16 lg:py-20" aria-labelledby="portal-heading">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 md:grid-cols-2 md:gap-10 lg:px-8">
        <div>
          <p className="text-sm font-semibold tracking-wide text-electric uppercase">Client portal</p>
          <h2 id="portal-heading" className="mt-2 text-2xl font-bold text-charcoal sm:text-3xl">
            Built for builders — not energy software operators
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:mt-4 sm:text-base">
            One place to start a project, accept a proposal, pay the 50% deposit,
            and download the EEDS when the work is complete. Each screen tells
            you the next step in plain language.
          </p>
          <ul className="mt-5 grid gap-2 text-sm text-charcoal sm:mt-6">
            {[
              "Simple wizard with one question at a time",
              "Proposal and 50/50 payment flow",
              "Documents stay locked until final payment",
              "Works on a phone at the jobsite",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-brand-green" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
            <TrackedLinkButton
              href="/create-account"
              variant="brand"
              className="min-h-11 w-full sm:w-auto"
              event="homepage_primary_cta_click"
              eventProperties={{ location: "portal_preview" }}
            >
              Start with my drawings
            </TrackedLinkButton>
            <LinkButton href="/login" variant="outline" className="min-h-11 w-full sm:w-auto">
              Log in
            </LinkButton>
          </div>
        </div>
        <div className="surface-card p-4">
          <div className="rounded-xl bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">My Projects</p>
              <span className="rounded-full bg-electric-soft px-2 py-0.5 text-xs font-medium text-electric">
                Next step
              </span>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              {[
                ["SB12-00124", "Wellington", "Pay remaining balance"],
                ["SB12-00123", "Cambridge", "Download documents"],
                ["SB12-00122", "Oakwood", "Continue setup"],
              ].map(([id, model, next]) => (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2.5"
                >
                  <div>
                    <p className="font-medium">{id}</p>
                    <p className="text-xs text-muted-foreground">{model}</p>
                  </div>
                  <span className="text-xs font-medium text-electric">{next}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeCloseCta() {
  return (
    <section className="relative overflow-hidden bg-charcoal py-12 text-white sm:py-16 lg:py-20">
      <div className="bg-hero-mesh absolute inset-0 opacity-70" />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-5 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-electric uppercase">
            Ready when you are
          </p>
          <h2 className="mt-2 max-w-xl text-2xl font-bold sm:text-3xl">
            Start an SB-12 package today
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/70">
            Create an account, upload drawings, and we will return a reviewed
            compliance package — typically within 48 business hours on complete
            Route 1 files.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <TrackedLinkButton
            href="/create-account"
            variant="brand"
            size="xl"
            className="min-h-11 w-full sm:w-auto"
            event="homepage_primary_cta_click"
            eventProperties={{ location: "close_cta" }}
          >
            Start with my drawings
          </TrackedLinkButton>
          <LinkButton
            href="/contact"
            variant="outline"
            size="xl"
            className="min-h-11 w-full border-white/20 bg-white/5 text-white hover:bg-white/10 sm:w-auto"
          >
            Talk to a modeller
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
