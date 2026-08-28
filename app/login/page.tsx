import { SiteShell } from "@/components/layout/site-shell";
import { LoginForm } from "@/components/auth/login-form";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Client Login",
  description: "Log in to the Energy Compliant Design client portal to manage SB-12 projects.",
  path: "/login",
  robots: privatePageRobots,
});

export default function LoginPage() {
  return (
    <SiteShell>
      <div className="relative overflow-hidden bg-muted/40 px-4 py-12 sm:px-6 lg:py-16">
        <div className="bg-hero-mesh pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-md">
          <LoginForm />
        </div>
      </div>
    </SiteShell>
  );
}
