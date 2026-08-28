import { CheckCircle2 } from "lucide-react";
import { LogoWatermark } from "@/components/brand/watermark";
import { TrackedLinkButton } from "@/components/analytics/tracked-link";
import { DELIVERABLES } from "@/lib/constants";

const turnaroundItems = [
  "HOT2000 model",
  "SB-12 analysis",
  "EEDS included",
  "Permit package",
];

export function HomeHero() {
  return (
    <section className="relative overflow-hidden bg-charcoal text-white">
      <div className="bg-hero-mesh absolute inset-0" />
      <div className="bg-grid-soft absolute inset-0 opacity-40" />
      <LogoWatermark opacity={0.1} />
      <div
        id="hero-end"
        className="relative mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-14 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10 lg:px-8 lg:py-20 xl:grid-cols-[1.15fr_0.85fr] xl:py-24"
      >
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-electric uppercase sm:text-xs">
            Ontario residential · SB-12 · HOT2000 · EEDS
          </p>
          <h1 className="mt-4 text-[1.75rem] font-bold tracking-tight text-balance sm:mt-5 sm:text-4xl md:text-[2.35rem] md:leading-[1.12] lg:text-5xl lg:leading-[1.08]">
            Ontario SB-12 Compliance &amp; HOT2000 Energy Modeling
          </h1>
          <p className="mt-3 max-w-xl text-base leading-6 text-white/88 sm:mt-4 sm:text-lg sm:leading-7 md:max-w-2xl">
            Permit-ready energy compliance packages for Ontario residential
            projects — complete Route&nbsp;1 projects typically delivered
            within 48 business hours.
          </p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/68 sm:text-[0.95rem]">
            Upload your architectural drawings. We complete the building
            takeoff, HOT2000 modelling, SB-12 analysis, EEDS, and permit-ready
            documentation.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:flex-wrap sm:items-center">
            <TrackedLinkButton
              href="/create-account"
              variant="brand"
              size="xl"
              className="w-full min-h-11 sm:w-auto"
              event="homepage_primary_cta_click"
              eventProperties={{ location: "hero" }}
            >
              Start with my drawings
            </TrackedLinkButton>
            <TrackedLinkButton
              href="/how-it-works"
              variant="outline"
              size="xl"
              className="w-full min-h-11 border-white/20 bg-white/5 text-white hover:bg-white/10 sm:w-auto"
              event="how_it_works_click"
              eventProperties={{ location: "hero" }}
            >
              See how it works
            </TrackedLinkButton>
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/58 sm:text-sm">
            <span>Fixed quote before deposit</span>
            <span aria-hidden className="text-white/35">
              ·
            </span>
            <span>Ontario-wide</span>
            <span aria-hidden className="text-white/35">
              ·
            </span>
            <span>Specialist-reviewed</span>
          </p>
        </div>

        <div className="min-w-0">
          {/* Compact mobile/tablet turnaround panel */}
          <div className="rounded-2xl border border-white/12 bg-white/6 p-4 backdrop-blur-md sm:p-5 md:hidden">
            <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-electric uppercase">
              Typical Route 1 turnaround
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight">48 business hours</p>
            <p className="mt-1 text-xs leading-5 text-white/68">
              After complete drawings and paid deposit.
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {turnaroundItems.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-xs text-white/88"
                >
                  <CheckCircle2 className="size-3.5 shrink-0 text-brand-green" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Richer desktop panel */}
          <div className="hidden rounded-3xl border border-white/12 bg-white/6 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md md:block lg:p-7">
            <p className="text-xs font-semibold tracking-[0.18em] text-electric uppercase">
              Typical turnaround
            </p>
            <p className="mt-3 text-3xl font-bold tracking-tight">48 business hours</p>
            <p className="mt-2 text-sm leading-6 text-white/70">
              For complete Route 1 projects after drawings and deposit.
            </p>
            <ul className="mt-6 grid gap-3 text-sm">
              {DELIVERABLES.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-white/88">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-green" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
