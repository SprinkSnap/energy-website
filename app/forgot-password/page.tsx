import { SiteShell } from "@/components/layout/site-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Forgot Password",
  description: "Reset your Energy Compliant Design client portal password.",
  path: "/forgot-password",
  robots: privatePageRobots,
});

export default function ForgotPasswordPage() {
  return (
    <SiteShell>
      <div className="bg-muted/50 px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-md">
          <ForgotPasswordForm />
        </div>
      </div>
    </SiteShell>
  );
}
