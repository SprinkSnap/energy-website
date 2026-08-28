export type AnalyticsEvent =
  | "homepage_primary_cta_click"
  | "how_it_works_click"
  | "service_card_click"
  | "account_creation_started"
  | "account_created"
  | "project_wizard_started"
  | "quote_started"
  | "quote_service_selected"
  | "quote_drawings_status_selected"
  | "quote_project_details_completed"
  | "quote_contact_completed"
  | "quote_submitted"
  | "quote_submission_failed"
  | "contact_submitted"
  | "contact_submission_failed";

export type AnalyticsProperties = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    ecdAnalyticsQueue?: Array<{ event: AnalyticsEvent; properties?: AnalyticsProperties }>;
  }
}

function sanitizeProperties(
  properties?: AnalyticsProperties,
): AnalyticsProperties | undefined {
  if (!properties) return undefined;
  const blocked = new Set(["email", "password", "phone", "message", "notes", "name"]);
  const clean: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (blocked.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

async function sendToProvider(event: AnalyticsEvent, properties?: AnalyticsProperties) {
  const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT?.trim();
  if (!endpoint) return;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, properties, ts: Date.now() }),
      keepalive: true,
    });
  } catch {
    // Provider delivery is best-effort
  }
}

/** Vendor-neutral analytics. Wire NEXT_PUBLIC_ANALYTICS_ENDPOINT or listen for ecd-analytics. */
export function trackEvent(event: AnalyticsEvent, properties?: AnalyticsProperties) {
  if (typeof window === "undefined") return;

  const safe = sanitizeProperties(properties);

  window.ecdAnalyticsQueue = window.ecdAnalyticsQueue ?? [];
  window.ecdAnalyticsQueue.push({ event, properties: safe });

  window.dispatchEvent(
    new CustomEvent("ecd-analytics", {
      detail: { event, properties: safe },
    }),
  );

  void sendToProvider(event, safe);

  if (process.env.NODE_ENV === "development") {
    console.debug("[analytics]", event, safe ?? {});
  }
}
