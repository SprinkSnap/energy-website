import { RequireAuth } from "@/components/auth/require-auth";
import { PortalHeader } from "@/components/layout/portal-header";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Client Portal",
  description: "Manage Energy Compliant Design projects, proposals, payments, and documents.",
  path: "/portal",
  robots: privatePageRobots,
});

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <RequireAuth>
      <div className="flex min-h-full flex-1 flex-col bg-muted/40">
        <PortalHeader />
        <div className="flex-1">{children}</div>
      </div>
    </RequireAuth>
  );
}
