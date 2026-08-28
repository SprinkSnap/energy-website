"use client";

import { useEffect, useState } from "react";
import { TrackedLinkButton } from "@/components/analytics/tracked-link";

export function MobileStickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById("hero-end");
    if (!sentinel) return;

    const media = window.matchMedia("(max-width: 639px)");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!media.matches) {
          setVisible(false);
          return;
        }
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px -10% 0px" },
    );

    const onMediaChange = () => {
      if (!media.matches) setVisible(false);
    };

    observer.observe(sentinel);
    media.addEventListener("change", onMediaChange);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", onMediaChange);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-charcoal/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.25)] backdrop-blur-md sm:hidden"
      role="region"
      aria-label="Quick action"
    >
      <TrackedLinkButton
        href="/quote?from=/&cta=mobile_sticky"
        variant="brand"
        size="lg"
        className="w-full min-h-11 justify-center"
        event="homepage_primary_cta_click"
        eventProperties={{ location: "mobile_sticky" }}
      >
        Get an SB-12 quote
      </TrackedLinkButton>
    </div>
  );
}
