import { Suspense } from "react";
import { SiteShell } from "@/components/layout/site-shell";
import { QuoteFunnel } from "@/components/quote/quote-funnel";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Request a Fixed SB-12 Quote",
  description:
    "Tell us about your Ontario residential project and request a fixed quote for SB-12, HOT2000, and EEDS compliance services.",
  path: "/quote",
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
});

function QuoteFallback() {
  return (
    <div className="surface-card mx-auto max-w-lg animate-pulse p-8">
      <div className="h-6 w-2/3 rounded bg-muted" />
      <div className="mt-4 h-4 w-full rounded bg-muted" />
      <div className="mt-6 h-10 w-full rounded bg-muted" />
    </div>
  );
}

export default function QuotePage() {
  return (
    <SiteShell>
      <div className="bg-muted/40 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto mb-8 max-w-lg text-center">
          <p className="text-sm font-semibold tracking-wide text-electric uppercase">Quote intake</p>
          <h1 className="mt-2 text-2xl font-bold text-charcoal sm:text-3xl">
            Start your SB-12 project
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            No account required. Describe your project and we will follow up with next steps for a
            fixed quote before any deposit.
          </p>
        </div>
        <Suspense fallback={<QuoteFallback />}>
          <QuoteFunnel />
        </Suspense>
      </div>
    </SiteShell>
  );
}
