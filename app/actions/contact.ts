"use server";

import { headers } from "next/headers";
import {
  contactFormSchema,
  type ContactPayload,
} from "@/lib/contact/schema";
import { checkRateLimit, rateLimitKey } from "@/lib/contact/rate-limit";
import {
  deliverViaWebhook,
  getContactWebhookUrl,
} from "@/lib/contact/providers/webhook";

export type SubmitContactState =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function submitContact(
  _prev: SubmitContactState | null,
  formData: FormData,
): Promise<SubmitContactState> {
  const parsed = contactFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company") || undefined,
    phone: formData.get("phone") || undefined,
    message: formData.get("message"),
    website: formData.get("website") ?? "",
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
  const limit = checkRateLimit(rateLimitKey(ip, "contact"));
  if (!limit.allowed) {
    return {
      ok: false,
      error: "Too many submissions. Please wait a moment and try again.",
    };
  }

  const webhookUrl = getContactWebhookUrl();
  if (!webhookUrl) {
    return {
      ok: false,
      error:
        "Contact delivery is not configured yet. Please email hello@energycompliantdesign.ca directly.",
    };
  }

  const payload: ContactPayload = {
    type: "contact",
    source: "contact_page",
    submittedAt: new Date().toISOString(),
    name: parsed.data.name,
    email: parsed.data.email,
    company: parsed.data.company,
    phone: parsed.data.phone,
    message: parsed.data.message,
  };

  const result = await deliverViaWebhook(webhookUrl, payload);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true };
}
