import { RequireStaff } from "@/components/auth/require-staff";
import { createMetadata, privatePageRobots } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Developer Admin",
  description: "Protected developer administration tools.",
  path: "/admin",
  robots: privatePageRobots,
});

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <RequireStaff>{children}</RequireStaff>;
}
