export type DeliveryResult =
  | { ok: true }
  | { ok: false; error: string; code: "not_configured" | "delivery_failed" | "rate_limited" };

export async function deliverViaWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<DeliveryResult> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "The submission service returned an error. Please try again or email us directly.",
        code: "delivery_failed",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Unable to deliver your message right now. Please try again or email us directly.",
      code: "delivery_failed",
    };
  }
}

export function getContactWebhookUrl(): string | undefined {
  return process.env.CONTACT_WEBHOOK_URL?.trim() || undefined;
}

export function getQuoteWebhookUrl(): string | undefined {
  return (
    process.env.QUOTE_WEBHOOK_URL?.trim() ||
    process.env.CONTACT_WEBHOOK_URL?.trim() ||
    undefined
  );
}
