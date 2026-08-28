import { SiteShell } from "@/components/layout/site-shell";
import { LinkButton } from "@/components/ui/link-button";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Page not found",
  description: "The requested page could not be found.",
  path: "/404",
});

export default function NotFound() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-sm font-semibold text-electric">404</p>
        <h1 className="mt-2 text-3xl font-bold text-charcoal">Page not found</h1>
        <p className="mt-3 text-muted-foreground">
          The page you requested is not available. Return home or open the client portal.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <LinkButton href="/" variant="brand">
            Home
          </LinkButton>
          <LinkButton href="/portal" variant="outline">
            Portal
          </LinkButton>
        </div>
      </div>
    </SiteShell>
  );
}
