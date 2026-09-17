import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RequireStaff } from "@/components/auth/require-staff";
import { evaluateStaffAccess } from "@/lib/auth/server-staff";
import { sanitizeInternalNextPath } from "@/lib/sanitize-internal-next-path";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Client Accounts",
  description: "Staff view of Energy Compliant Design client accounts and projects.",
  path: "/portal/admin",
  robots: privatePageRobots,
});

function StaffLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Loading staff portal…
    </div>
  );
}

async function PortalAdminStaffGate({ children }: { children: React.ReactNode }) {
  const access = await evaluateStaffAccess();

  if (access.kind === "unauthenticated") {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? "/portal/admin";
    const search = headersList.get("x-search") ?? "";
    const nextPath = sanitizeInternalNextPath(`${pathname}${search}`, "/portal/admin");
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (access.kind === "forbidden") {
    redirect("/unauthorized");
  }

  return (
    <Suspense fallback={<StaffLoading />}>
      <RequireStaff>{children}</RequireStaff>
    </Suspense>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/portal/admin">) {
  return <PortalAdminStaffGate>{children}</PortalAdminStaffGate>;
}
