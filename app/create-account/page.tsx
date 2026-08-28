import { SiteShell } from "@/components/layout/site-shell";
import { CreateAccountForm } from "@/components/auth/create-account-form";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Create Account",
  description:
    "Create an Energy Compliant Design client account to start HOT2000 and SB-12 energy compliance projects.",
  path: "/create-account",
});

export default function CreateAccountPage() {
  return (
    <SiteShell>
      <div className="bg-muted/50 px-4 py-12 sm:px-6 lg:py-16">
        <div className="mx-auto max-w-lg">
          <CreateAccountForm />
        </div>
      </div>
    </SiteShell>
  );
}
