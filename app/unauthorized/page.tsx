import { SiteShell } from "@/components/layout/site-shell";
import { AccessDenied } from "@/components/auth/access-denied";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Access Denied",
  description: "You do not have permission to access this page.",
  path: "/unauthorized",
  robots: privatePageRobots,
});

export default function UnauthorizedPage() {
  return (
    <SiteShell>
      <AccessDenied />
    </SiteShell>
  );
}
