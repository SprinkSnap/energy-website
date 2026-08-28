import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Layers3,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { LogoWatermark } from "@/components/brand/watermark";
import { LinkButton } from "@/components/ui/link-button";
import { SITE_SUPPORT_LINE, SITE_TAGLINE } from "@/lib/constants";

export function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-charcoal text-white">
      <div className="bg-hero-mesh absolute inset-0" />
      <div className="bg-grid-soft absolute inset-0 opacity-40" />
      <LogoWatermark opacity={0.1} />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8 lg:py-28">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-electric uppercase">
            {SITE_SUPPORT_LINE}
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
            Permit-ready SB-12 packages in 48 hours
          </h1>
          <p className="mt-4 max-w-xl text-xl text-white/85 sm:text-2xl">
            {SITE_TAGLINE}
          </p>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/70">
            Upload drawings, confirm specifications, and receive HOT2000 models,
            SB-12 analysis, and the EEDS — reviewed by Energy Compliant Design,
            not auto-generated and left unchecked.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <LinkButton href="/create-account" variant="brand" size="xl">
              Start a project
            </LinkButton>
            <LinkButton
              href="/login"
              variant="outline"
              size="xl"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
              Log in
            </LinkButton>
          </div>
          <p className="mt-4 text-sm text-white/55">
            Already have drawings? Create an account and start the wizard in
            minutes.{" "}
            <Link href="/how-it-works" className="text-white/80 underline-offset-4 hover:underline">
              See how it works
            </Link>
          </p>
        </div>
        <div className="rounded-3xl border border-white/12 bg-white/6 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <p className="text-xs font-semibold tracking-[0.18em] text-electric uppercase">
            Typical turnaround
          </p>
          <p className="mt-3 text-3xl font-bold tracking-tight">48-hour delivery</p>
          <p className="mt-2 text-sm leading-6 text-white/70">
            For complete Route 1 projects after drawings and deposit.
          </p>
          <ul className="mt-6 grid gap-3 text-sm">
            {[
              "HOT2000 proposed and reference models",
              "SB-12 compliance analysis",
              "EEDS — Energy Efficiency Design Summary",
              "Complete permit package",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-white/88">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-green" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function HomeTrustBar() {
  const items = [
    "Ontario residential",
    "HOT2000 modelling",
    "SB-12 compliance",
    "EEDS for permit",
    "48-hour delivery",
  ];
  return (
    <section className="border-y border-border bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6 lg:justify-between lg:px-8">
        {items.map((item) => (
          <p
            key={item}
            className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase"
          >
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

const processSteps = [
  {
    n: "01",
    title: "Create an account",
    body: "Open the client portal. One login for every project.",
  },
  {
    n: "02",
    title: "Upload drawings & specs",
    body: "We take the geometry. You confirm assemblies and mechanicals.",
  },
  {
    n: "03",
    title: "Accept proposal & deposit",
    body: "Clear fees. 50% starts the model. 50% unlocks the files.",
  },
  {
    n: "04",
    title: "Download the package",
    body: "EEDS, HOT2000 reports, and the permit set — ready for the city.",
  },
];

export function HomeProcess() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold tracking-wide text-electric uppercase">
          How it works
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-bold text-charcoal">
          Four steps from drawings to a permit-ready package
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {processSteps.map((step) => (
            <article key={step.n} className="surface-card p-6">
              <p className="text-xs font-semibold tracking-[0.18em] text-electric uppercase">
                {step.n}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-charcoal">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const services = [
  {
    title: "HOT2000 Energy Modeling",
    description:
      "Proposed and code/reference models prepared from your drawings and specifications.",
    icon: Layers3,
  },
  {
    title: "SB-12 Compliance",
    description:
      "Performance-path analysis for Ontario Supplementary Standard SB-12 residential projects.",
    icon: ShieldCheck,
  },
  {
    title: "EEDS Preparation",
    description:
      "Energy Efficiency Design Summary forms completed for municipal permit review.",
    icon: FileSpreadsheet,
  },
  {
    title: "Building Takeoff",
    description:
      "We extract geometry, areas, and window-to-wall ratio so you do not have to.",
    icon: Upload,
  },
];

export function HomeServices() {
  return (
    <section className="bg-muted/50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-electric uppercase">
              Services
            </p>
            <h2 className="mt-2 text-3xl font-bold text-charcoal">
              Residential energy compliance, end to end
            </h2>
          </div>
          <Link
            href="/services"
            className="inline-flex items-center gap-1 text-sm font-semibold text-electric hover:underline"
          >
            View Services <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <article key={service.title} className="surface-card p-6">
              <service.icon className="size-6 text-electric" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold text-charcoal">{service.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {service.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const routes = [
  {
    n: "Route 1",
    title: "I Know My Building Specifications",
    body: "Envelope and mechanical specs are already defined.",
    bestFor: "Production and repeat models",
    need: "Drawings + confirmed specs",
    time: "48-hour package after deposit",
  },
  {
    n: "Route 2",
    title: "Custom (Optimization)",
    body: "Need help selecting a compliant assembly mix.",
    bestFor: "Custom homes still deciding assemblies",
    need: "Drawings + a kickoff call",
    time: "Structured review, then proposal",
  },
  {
    n: "Route 3",
    title: "Over 22% Window-to-Wall Ratio",
    body: "Prescriptive packages generally do not apply above 22% WWR.",
    bestFor: "High-glazing elevations",
    need: "Drawings + Path 1 or Path 2",
    time: "Performance-path modelling",
  },
];

export function HomeHowItWorks() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold tracking-wide text-electric uppercase">
          Choose a route
        </p>
        <h2 className="mt-2 text-3xl font-bold text-charcoal">
          Three clear project routes
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Pick the path that matches how decided the house already is. We handle
          takeoff, modelling, and the permit package.
        </p>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {routes.map((route) => (
            <article key={route.n} className="surface-card flex flex-col p-6">
              <p className="text-xs font-semibold tracking-wider text-electric uppercase">
                {route.n}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-charcoal">{route.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{route.body}</p>
              <dl className="mt-5 grid gap-2 border-t border-border pt-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Best for
                  </dt>
                  <dd className="mt-0.5 text-charcoal">{route.bestFor}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    You’ll need
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
            </article>
          ))}
        </div>
        <div className="mt-8">
          <LinkButton href="/how-it-works" variant="outline">
            See the full process
          </LinkButton>
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
    <section className="bg-muted/50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-charcoal">Why builders choose us</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {items.map((item) => (
            <article key={item.title} className="rounded-2xl bg-charcoal p-6 text-white">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/70">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeTrust() {
  return (
    <section className="relative overflow-hidden bg-electric-soft py-14">
      <LogoWatermark opacity={0.1} blend="normal" />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-start gap-4">
          <Clock3 className="size-10 text-electric" aria-hidden />
          <div>
            <h2 className="text-2xl font-bold text-charcoal">
              Compliance you can stand behind at the counter
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Known-specification projects move quickly. Optimization and over-22%
              WWR work follow a structured review so the model stays defensible.
            </p>
          </div>
        </div>
        <LinkButton href="/contact" variant="brand" size="lg">
          Talk to a modeller
        </LinkButton>
      </div>
    </section>
  );
}

export function HomePortalPreview() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="text-sm font-semibold tracking-wide text-electric uppercase">
            Client portal
          </p>
          <h2 className="mt-2 text-3xl font-bold text-charcoal">
            Built for builders — not energy software operators
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            One place to start a project, accept a proposal, pay the 50% deposit,
            and download the EEDS when the work is complete. Each screen tells
            you the next step in plain language.
          </p>
          <ul className="mt-6 grid gap-2 text-sm text-charcoal">
            {[
              "Simple wizard with one question at a time",
              "Proposal and 50/50 payment flow",
              "Documents stay locked until final payment",
              "Works on a phone at the jobsite",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-brand-green" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/create-account" variant="brand">
              Start a project
            </LinkButton>
            <LinkButton href="/login" variant="outline">
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
    <section className="relative overflow-hidden bg-charcoal py-16 text-white">
      <div className="bg-hero-mesh absolute inset-0 opacity-70" />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-electric uppercase">
            Ready when you are
          </p>
          <h2 className="mt-2 max-w-xl text-3xl font-bold">
            Start an SB-12 package today
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/70">
            Create an account, upload drawings, and we will return a reviewed
            compliance package — typically within 48 hours on complete Route 1 files.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/create-account" variant="brand" size="xl">
            Start a project
          </LinkButton>
          <LinkButton
            href="/contact"
            variant="outline"
            size="xl"
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            Talk to a modeller
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
