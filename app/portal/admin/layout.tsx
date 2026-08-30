import { RequireStaff } from "@/components/auth/require-staff";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Client Accounts",
  description: "Staff view of Energy Compliant Design client accounts and projects.",
  path: "/portal/admin",
  robots: privatePageRobots,
});

export default function AdminLayout({ children }: LayoutProps<"/portal/admin">) {
  return <RequireStaff>{children}</RequireStaff>;
}
