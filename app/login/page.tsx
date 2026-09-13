import { SiteShell } from "@/components/layout/site-shell";
import { LoginForm } from "@/components/auth/login-form";
import { createMetadata, privatePageRobots } from "@/lib/seo";
import { sanitizeInternalNextPath } from "@/lib/sanitize-internal-next-path";

export const metadata = createMetadata({
  title: "Client Login",
  description: "Log in to the Energy Compliant Design client portal to manage SB-12 projects.",
  path: "/login",
  robots: privatePageRobots,
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : undefined;
  const nextPath = sanitizeInternalNextPath(rawNext);

  return (
    <SiteShell>
      <div className="relative overflow-hidden bg-muted/40 px-4 py-12 sm:px-6 lg:py-16">
        <div className="bg-hero-mesh pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-md">
          <LoginForm nextPath={nextPath} />
        </div>
      </div>
    </SiteShell>
  );
}
