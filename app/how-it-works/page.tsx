import { SiteShell } from "@/components/layout/site-shell";
import { PageHero } from "@/components/layout/page-hero";
import { LinkButton } from "@/components/ui/link-button";
import { createMetadata } from "@/lib/seo";
import {
  calculatePricing,
  ROUTE_3_PATH_2_FEE,
  ROUTE_PROFESSIONAL_FEES,
} from "@/lib/pricing";
import { cad } from "@/lib/format";

export const metadata = createMetadata({
  title: "How SB-12 Energy Compliance Works",
  description:
    "Choose Route 1 known specifications, Route 2 custom optimization, or Route 3 over 22% WWR. Then follow proposal, deposit, modelling, and document download.",
  path: "/how-it-works",
});

const route1 = [
  "Draft",
  "Submitted",
  "Proposal",
  "Awaiting Deposit",
  "In Progress",
  "Final Payment Required",
  "Complete",
];

const route2 = [
  "Draft",
  "Submitted",
  "Kickoff Call",
  "Optimization",
  "Options Review",
  "Client Selection",
  "Proposal",
  "Awaiting Deposit",
  "In Progress",
  "Final Payment Required",
  "Complete",
];

const route3 = [
  "Draft",
  "Submitted",
  "Project Review / Optimization",
  "Proposal",
  "Awaiting Deposit",
  "In Progress",
  "Final Payment Required",
  "Complete",
];

function Timeline({ title, steps }: { title: string; steps: string[] }) {
  return (
    <article className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-charcoal">{title}</h3>
      <ol className="mt-4 grid gap-2">
        {steps.map((step, i) => (
          <li key={step} className="flex items-center gap-3 text-sm">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-electric-soft text-xs font-semibold text-electric">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </article>
  );
}

export default function HowItWorksPage() {
  return (
    <SiteShell>
      <PageHero
        title="How it works"
        description="Three routes. One client portal. You choose the path that matches the house; we keep status visible from first draft to unlocked documents."
      />
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-2xl bg-charcoal p-6 text-white">
            <p className="text-xs font-semibold tracking-wider text-electric uppercase">Route 1</p>
            <h2 className="mt-2 text-2xl font-semibold">I Know My Building Specifications</h2>
            <p className="mt-3 text-sm font-semibold text-white">
              {cad(ROUTE_PROFESSIONAL_FEES["known-specs"])} + HST ·{" "}
              {cad(calculatePricing(ROUTE_PROFESSIONAL_FEES["known-specs"]).total)} total
            </p>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Use this route when envelope and mechanical specifications are already decided. Fastest path to 48-hour delivery after drawings and deposit.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-white p-6">
            <p className="text-xs font-semibold tracking-wider text-electric uppercase">Route 2</p>
            <h2 className="mt-2 text-2xl font-semibold text-charcoal">Custom (Optimization)</h2>
            <p className="mt-3 text-sm font-semibold text-charcoal">
              {cad(ROUTE_PROFESSIONAL_FEES["custom-optimization"])} + HST ·{" "}
              {cad(calculatePricing(ROUTE_PROFESSIONAL_FEES["custom-optimization"]).total)} total
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Choose this route if you need help determining or optimizing specifications. It includes a kickoff call, Energy Compliant Design review, optimization, an options review call, and your selection of the preferred solution.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-white p-6">
            <p className="text-xs font-semibold tracking-wider text-electric uppercase">Route 3</p>
            <h2 className="mt-2 text-2xl font-semibold text-charcoal">Over 22% Window-to-Wall Ratio</h2>
            <p className="mt-3 text-sm font-semibold text-charcoal">
              Path 1 {cad(ROUTE_PROFESSIONAL_FEES["over-22-wwr"])} · Path 2 {cad(ROUTE_3_PATH_2_FEE)} + HST
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Choose this route when WWR is greater than 22%. Path 1 is for known specifications. Path 2 is for projects that need help defining them.
            </p>
          </article>
        </div>
        <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-charcoal">Account required to add projects</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Create a free client account to start a project in the portal. Each route has a fixed fee
            shown in the proposal and deposit invoice. You can delete a draft any time before the first
            50% deposit is paid.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/create-account" variant="brand" className="min-h-11 justify-center">
              Create account
            </LinkButton>
            <LinkButton href="/login" variant="outline" className="min-h-11 justify-center">
              Sign in
            </LinkButton>
          </div>
        </div>
        <h2 className="mt-14 text-2xl font-bold text-charcoal">Status, simplified</h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Timeline title="Route 1" steps={route1} />
          <Timeline title="Route 2 — Custom (Optimization)" steps={route2} />
          <Timeline title="Route 3 — Over 22% WWR" steps={route3} />
        </div>
        <div className="mt-12 rounded-2xl border border-border bg-muted/40 p-6">
          <h2 className="text-xl font-semibold text-charcoal">What you never have to calculate</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Energy Compliant Design uses the architectural drawings to complete the building takeoff and determine HOT2000 geometry.
          </p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Building volume",
              "Exterior wall areas",
              "Window areas",
              "Door areas",
              "Ceiling areas",
              "Exposed floor areas",
              "Foundation areas",
              "Window-to-wall ratio",
              "HOT2000 geometry",
            ].map((item) => (
              <li key={item} className="rounded-lg bg-white px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10">
          <LinkButton href="/quote?from=/how-it-works&cta=bottom" variant="brand" size="lg" className="min-h-11">
            Get an SB-12 quote
          </LinkButton>
        </div>
      </section>
    </SiteShell>
  );
}
