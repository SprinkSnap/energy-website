import type { QuoteFormInput } from "@/lib/quote/schema";

const STORAGE_KEY = "ecd-quote-intake";

export type QuotePrefill = Pick<
  QuoteFormInput,
  "name" | "email" | "company" | "phone" | "service" | "city" | "drawingsStatus" | "projectType"
>;

export function saveQuotePrefill(data: QuotePrefill): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage unavailable
  }
}

export function consumeQuotePrefill(): QuotePrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw) as QuotePrefill;
  } catch {
    return null;
  }
}

export function peekQuotePrefill(): QuotePrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QuotePrefill) : null;
  } catch {
    return null;
  }
}
