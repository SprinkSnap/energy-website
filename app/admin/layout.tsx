import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RequireStaff } from "@/components/auth/require-staff";
import { evaluateStaffAccess } from "@/lib/auth/server-staff";
import { sanitizeInternalNextPath } from "@/lib/sanitize-internal-next-path";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Developer Admin",
  description: "Protected developer administration tools.",
  path: "/admin",
  robots: privatePageRobots,
});

function StaffLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Loading staff portal…
    </div>
  );
}

async function AdminStaffGate({ children }: { children: React.ReactNode }) {
  const access = await evaluateStaffAccess();

  if (access.kind === "unauthenticated") {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? "/admin";
    const search = headersList.get("x-search") ?? "";
    const nextPath = sanitizeInternalNextPath(`${pathname}${search}`, "/admin");
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

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <AdminStaffGate>{children}</AdminStaffGate>;
}
