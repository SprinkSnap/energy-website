import { SiteShell } from "@/components/layout/site-shell";
import {
  HomeCloseCta,
  HomeDeliverables,
  HomeHero,
  HomeHowItWorks,
  HomePortalPreview,
  HomeProcess,
  HomeServices,
  HomeTrust,
  HomeTrustBar,
  HomeWhyChoose,
  MobileStickyCta,
} from "@/components/home";
import { HomeFaq, HomeTestimonials } from "@/components/home/faq";
import { homeMetadata } from "@/lib/seo";

export const metadata = homeMetadata;

export default function HomePage() {
  return (
    <SiteShell>
      <div className="pb-20 sm:pb-0">
        <HomeHero />
        <HomeTrustBar />
        <HomeDeliverables />
        <HomeProcess />
        <HomeServices />
        <HomeHowItWorks />
        <HomeWhyChoose />
        <HomeTrust />
        <HomePortalPreview />
        <HomeFaq />
        <HomeTestimonials />
        <HomeCloseCta />
      </div>
      <MobileStickyCta />
    </SiteShell>
  );
}
