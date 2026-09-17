import { notFound, redirect } from "next/navigation";
import { StaffSessionBanner } from "@/components/auth/staff-session-banner";
import { Hot2000RecorderClient } from "@/components/admin/hot2000-recorder-client";
import { evaluateStaffAccess } from "@/lib/auth/server-staff";
import { isCatalogRecorderEnabled } from "@/lib/hot2000/catalog-recorder";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "HOT2000 Catalog Recorder",
  description: "Developer-only HOT2000 Desktop catalog capture tools.",
  path: "/admin/hot2000-recorder",
  robots: privatePageRobots,
});

export default async function Hot2000RecorderPage() {
  if (!isCatalogRecorderEnabled()) {
    notFound();
  }

  const access = await evaluateStaffAccess();
  if (access.kind === "unauthenticated") {
    redirect(`/login?next=${encodeURIComponent("/admin/hot2000-recorder")}`);
  }
  if (access.kind === "forbidden") {
    redirect("/unauthorized");
  }

  return (
    <>
      <StaffSessionBanner />
      <Hot2000RecorderClient />
    </>
  );
}
