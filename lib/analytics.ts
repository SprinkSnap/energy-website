export type AnalyticsEvent =
  | "homepage_primary_cta_click"
  | "how_it_works_click"
  | "service_card_click"
  | "account_creation_started"
  | "account_created"
  | "project_wizard_started";

export type AnalyticsProperties = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    ecdAnalyticsQueue?: Array<{ event: AnalyticsEvent; properties?: AnalyticsProperties }>;
  }
}

/** Vendor-neutral analytics hook. Wire to GA/Plausible/etc. when a provider is added. */
export function trackEvent(event: AnalyticsEvent, properties?: AnalyticsProperties) {
  if (typeof window === "undefined") return;

  window.ecdAnalyticsQueue = window.ecdAnalyticsQueue ?? [];
  window.ecdAnalyticsQueue.push({ event, properties });

  window.dispatchEvent(
    new CustomEvent("ecd-analytics", {
      detail: { event, properties },
    }),
  );

  if (process.env.NODE_ENV === "development") {
    console.debug("[analytics]", event, properties ?? {});
  }
}
