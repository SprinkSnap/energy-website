import { SiteShell } from "@/components/layout/site-shell";
import {
  HomeCloseCta,
  HomeHero,
  HomeHowItWorks,
  HomePortalPreview,
  HomeProcess,
  HomeServices,
  HomeTrust,
  HomeTrustBar,
  HomeWhyChoose,
} from "@/components/home/sections";
import { HomeFaq, HomeTestimonials } from "@/components/home/faq";
import { homeMetadata } from "@/lib/seo";

export const metadata = homeMetadata;

export default function HomePage() {
  return (
    <SiteShell>
      <HomeHero />
      <HomeTrustBar />
      <HomeProcess />
      <HomeServices />
      <HomeHowItWorks />
      <HomeWhyChoose />
      <HomeTrust />
      <HomePortalPreview />
      <HomeTestimonials />
      <HomeFaq />
      <HomeCloseCta />
    </SiteShell>
  );
}
