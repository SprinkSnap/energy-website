import { SiteShell } from "@/components/layout/site-shell";
import { createMetadata } from "@/lib/seo";
import { SITE_NAME } from "@/lib/constants";

export const metadata = createMetadata({
  title: "Terms of Service",
  description: `Terms of use for the ${SITE_NAME} website and client portal.`,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <SiteShell>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-bold text-charcoal">Terms of Service</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated August 28, 2026</p>
        <div className="mt-8 space-y-4 text-sm leading-7 text-muted-foreground">
          <p>
            By creating an account you confirm that project information and proposed specifications are accurate to the best of your knowledge. Energy modelling results depend on the drawings and data supplied.
          </p>
          <p>
            Professional fees, HST, and the 50% deposit / 50% final split are shown on each proposal. Work begins after the deposit is received. Final documents remain locked until paid in full.
          </p>
          <p>
            HOT2000 reports and EEDS forms are prepared for permit support. They are not a substitute for the designer of record or municipal review.
          </p>
        </div>
      </article>
    </SiteShell>
  );
}
