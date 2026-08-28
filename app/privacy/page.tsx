import { SiteShell } from "@/components/layout/site-shell";
import { createMetadata } from "@/lib/seo";
import { SITE_NAME } from "@/lib/constants";

export const metadata = createMetadata({
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects and uses information on this website and client portal.`,
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <SiteShell>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-bold text-charcoal">Privacy Policy</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated August 28, 2026</p>
        <div className="mt-8 space-y-4 text-sm leading-7 text-muted-foreground">
          <p>
            {SITE_NAME} collects account details, project specifications, and uploaded drawings solely to prepare energy compliance packages and to operate the client portal.
          </p>
          <p>
            This MVP stores demo data in your browser. A production deployment will keep project files on secured servers, limit access to assigned staff, and retain records as required for professional practice.
          </p>
          <p>
            We do not sell personal information. Payment details on this demo are placeholders and must be replaced with a PCI-compliant processor before live billing.
          </p>
          <p>
            Questions: hello@energycompliantdesign.ca
          </p>
        </div>
      </article>
    </SiteShell>
  );
}
