import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { SITE_NAME, SITE_URL, CONTACT } from "@/lib/constants";
import { defaultKeywords, stagingPageRobots } from "@/lib/seo";
import { IS_STAGING } from "@/lib/site-env";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: IS_STAGING
      ? `[Staging] SB-12 Compliance & HOT2000 Energy Modeling Ontario | ${SITE_NAME}`
      : `SB-12 Compliance & HOT2000 Energy Modeling Ontario | ${SITE_NAME}`,
    template: IS_STAGING ? `[Staging] %s | ${SITE_NAME}` : `%s | ${SITE_NAME}`,
  },
  description:
    "Permit-ready SB-12, HOT2000 and EEDS packages for Ontario residential projects. Complete Route 1 projects are typically delivered within 48 business hours.",
  keywords: defaultKeywords,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  applicationName: SITE_NAME,
  category: "professional services",
  formatDetection: { telephone: false, email: false, address: false },
    openGraph: {
    type: "website",
    locale: "en_CA",
    url: SITE_URL,
    siteName: IS_STAGING ? `${SITE_NAME} (Staging)` : SITE_NAME,
    title: `SB-12 Compliance & HOT2000 Energy Modeling Ontario | ${SITE_NAME}`,
    description:
      "Permit-ready SB-12, HOT2000 and EEDS packages for Ontario residential projects.",
  },
  twitter: {
    card: "summary_large_image",
    title: `SB-12 Compliance & HOT2000 Energy Modeling Ontario | ${SITE_NAME}`,
    description:
      "Permit-ready SB-12, HOT2000 and EEDS packages for Ontario residential projects.",
  },
  robots: IS_STAGING
    ? stagingPageRobots
    : {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true },
      },
  alternates: { canonical: SITE_URL },
  icons: {
    icon: [{ url: "/logo-icon.png", type: "image/png" }],
    apple: [{ url: "/logo-icon.png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": ["Organization", "ProfessionalService"],
    name: SITE_NAME,
    url: SITE_URL,
    image: `${SITE_URL}/logo.png`,
    logo: `${SITE_URL}/logo-icon.png`,
    email: CONTACT.email,
    areaServed: { "@type": "AdministrativeArea", name: "Ontario" },
    description:
      "HOT2000 energy modelling, SB-12 compliance, EEDS preparation, and residential permit packages for Ontario.",
    knowsAbout: [
      "HOT2000",
      "SB-12",
      "EEDS",
      "Energy Efficiency Design Summary",
      "Residential energy compliance",
    ],
  };

  return (
    <html
      lang="en-CA"
      className={`${plusJakarta.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <Providers>
          {children}
          <Toaster position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
