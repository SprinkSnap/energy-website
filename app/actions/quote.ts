"use server";

import { headers } from "next/headers";
import { quoteFormSchema, type QuotePayload } from "@/lib/quote/schema";
import { checkRateLimit, rateLimitKey } from "@/lib/contact/rate-limit";
import {
  deliverViaWebhook,
  getQuoteWebhookUrl,
} from "@/lib/contact/providers/webhook";

export type SubmitQuoteState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function submitQuote(
  _prev: SubmitQuoteState | null,
  formData: FormData,
): Promise<SubmitQuoteState> {
  const parsed = quoteFormSchema.safeParse({
    service: formData.get("service"),
    drawingsStatus: formData.get("drawingsStatus"),
    city: formData.get("city"),
    projectType: formData.get("projectType") || undefined,
    timeline: formData.get("timeline") || undefined,
    notes: formData.get("notes") || undefined,
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company") || undefined,
    phone: formData.get("phone") || undefined,
    website: formData.get("website") ?? "",
    sourcePage: formData.get("sourcePage") || undefined,
    ctaLocation: formData.get("ctaLocation") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (parsed.data.website) {
    return { ok: true };
  }

  const headerStore = await headers();
  const ip =
    headerStore.get("cf-connecting-ip") ??
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const limit = checkRateLimit(rateLimitKey(ip, "quote"));
  if (!limit.allowed) {
    return {
      ok: false,
      error: "Too many submissions. Please wait a moment and try again.",
    };
  }

  const webhookUrl = getQuoteWebhookUrl();
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "Quote intake is not configured yet. Please email hello@energycompliantdesign.ca directly.",
    };
  }

  const { website: _honeypot, ...data } = parsed.data;
  const payload: QuotePayload = {
    type: "quote",
    submittedAt: new Date().toISOString(),
    ...data,
  };

  const result = await deliverViaWebhook(webhookUrl, payload);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true };
}
