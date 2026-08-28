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
import { SITE_NAME, SITE_SUPPORT_LINE, SITE_TAGLINE } from "@/lib/constants";

export function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-charcoal text-white">
      <div className="bg-grid-soft absolute inset-0 opacity-60" />
      <LogoWatermark opacity={0.12} />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8 lg:py-28">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-electric uppercase">
            {SITE_SUPPORT_LINE}
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {SITE_NAME}
          </h1>
          <p className="mt-4 max-w-xl text-xl text-white/85 sm:text-2xl">
            {SITE_TAGLINE}
          </p>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/70">
            Submit drawings, confirm specifications, and receive a complete SB-12
            energy compliance package — HOT2000 models, EEDS, and permit documents
            — without calculating geometry yourself.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/create-account" variant="brand" size="xl">
              Create Account
            </LinkButton>
            <LinkButton
              href="/portal/projects/new"
              variant="outline"
              size="xl"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
              Start New Project
            </LinkButton>
            <LinkButton
              href="/how-it-works"
              variant="ghost"
              size="xl"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              Learn More
            </LinkButton>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm">
          <p className="text-sm font-semibold text-electric">Typical turnaround</p>
          <p className="mt-2 text-3xl font-bold">48-hour delivery</p>
          <p className="mt-2 text-sm text-white/70">
            For complete Route 1 projects after drawings and deposit.
          </p>
          <ul className="mt-6 grid gap-3 text-sm">
            {[
              "HOT2000 proposed and reference models",
              "SB-12 compliance analysis",
              "EEDS — Energy Efficiency Design Summary",
              "Complete permit package",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-white/85">
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
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-wide text-electric uppercase">Services</p>
            <h2 className="mt-2 text-3xl font-bold text-charcoal">Residential energy compliance, end to end</h2>
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
            <article
              key={service.title}
              className="rounded-2xl border border-border bg-background p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <service.icon className="size-6 text-electric" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold text-charcoal">{service.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{service.description}</p>
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
    body: "Choose this path when envelope and mechanical specifications are already defined. Fastest route to a 48-hour package.",
  },
  {
    n: "Route 2",
    title: "Custom (Optimization)",
    body: "Need help selecting a compliant assembly mix? Includes a kickoff call, Energy Compliant Design review, optimization, and an options review call.",
  },
  {
    n: "Route 3",
    title: "Over 22% Window-to-Wall Ratio",
    body: "When WWR exceeds 22%, prescriptive packages generally do not apply. We review Path 1 (known specs) or Path 2 (need help) and model a compliant solution.",
  },
];

export function HomeHowItWorks() {
  return (
    <section className="bg-muted/60 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold tracking-wide text-electric uppercase">How it works</p>
        <h2 className="mt-2 text-3xl font-bold text-charcoal">Three clear project routes</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Start in the client portal, choose the route that matches your project, and we handle takeoff, modelling, and the permit package.
        </p>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {routes.map((route) => (
            <article key={route.n} className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold tracking-wider text-electric uppercase">{route.n}</p>
              <h3 className="mt-2 text-xl font-semibold text-charcoal">{route.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{route.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-8">
          <LinkButton href="/how-it-works" variant="brand">
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
    <section className="bg-white py-16 sm:py-20">
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
      <LogoWatermark opacity={0.12} blend="normal" />
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-start gap-4">
          <Clock3 className="size-10 text-electric" aria-hidden />
          <div>
            <h2 className="text-2xl font-bold text-charcoal">48-hour delivery on complete files</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Known-specification projects move quickly. Optimization and over-22% WWR work follow a structured review so the model stays defensible.
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
          <p className="text-sm font-semibold tracking-wide text-electric uppercase">Client portal</p>
          <h2 className="mt-2 text-3xl font-bold text-charcoal">One place for projects, proposals, and documents</h2>
          <p className="mt-4 text-muted-foreground leading-7">
            Create an account, start an SB-12 wizard, accept a proposal, pay the 50% deposit, and download the EEDS and HOT2000 reports when the project is complete.
          </p>
          <ul className="mt-6 grid gap-2 text-sm text-charcoal">
            {[
              "Multi-step project wizard with conditional specs",
              "Proposal and 50/50 payment flow",
              "Locked documents until final payment",
              "Mobile-friendly project cards",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-brand-green" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/create-account" variant="brand">
              Create Account
            </LinkButton>
            <LinkButton href="/login" variant="outline">
              Log in
            </LinkButton>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-muted/40 p-4 shadow-sm">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">My Projects</p>
              <span className="rounded-full bg-electric-soft px-2 py-0.5 text-xs font-medium text-electric">Portal preview</span>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              {[
                ["SB12-00124", "Wellington", "In Progress"],
                ["SB12-00123", "Cambridge", "Complete"],
                ["SB12-00122", "Oakwood", "Draft"],
              ].map(([id, model, status]) => (
                <div key={id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="font-medium">{id}</p>
                    <p className="text-xs text-muted-foreground">{model}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
