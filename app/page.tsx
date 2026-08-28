import { SiteShell } from "@/components/layout/site-shell";
import {
  HomeHero,
  HomeHowItWorks,
  HomePortalPreview,
  HomeServices,
  HomeTrust,
  HomeWhyChoose,
} from "@/components/home/sections";
import { HomeFaq, HomeTestimonials } from "@/components/home/faq";
import { homeMetadata } from "@/lib/seo";

export const metadata = homeMetadata;

export default function HomePage() {
  return (
    <SiteShell>
      <HomeHero />
      <HomeServices />
      <HomeHowItWorks />
      <HomeWhyChoose />
      <HomeTrust />
      <HomePortalPreview />
      <HomeTestimonials />
      <HomeFaq />
    </SiteShell>
  );
}
