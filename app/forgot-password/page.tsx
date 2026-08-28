import { SiteShell } from "@/components/layout/site-shell";
import { BrandLogo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/link-button";
import { createMetadata } from "@/lib/seo";
import { CONTACT } from "@/lib/constants";

export const metadata = createMetadata({
  title: "Forgot Password",
  description: "Password reset placeholder for the Energy Compliant Design client portal.",
  path: "/forgot-password",
});

export default function ForgotPasswordPage() {
  return (
    <SiteShell>
      <div className="bg-muted/50 px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-border/80 bg-white p-8 shadow-[0_1px_2px_rgba(11,18,32,0.04),0_18px_48px_rgba(11,18,32,0.08)]">
          <BrandLogo />
          <h1 className="mt-6 text-2xl font-bold text-charcoal">Forgot password</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Password reset is a placeholder in this MVP. Email{" "}
            <a className="text-electric hover:underline" href={`mailto:${CONTACT.email}`}>
              {CONTACT.email}
            </a>{" "}
            or use the demo client login while server-side auth is connected.
          </p>
          <LinkButton href="/login" className="mt-6" variant="brand">
            Back to login
          </LinkButton>
        </div>
      </div>
    </SiteShell>
  );
}
