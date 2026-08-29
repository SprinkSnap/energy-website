import type { Over22Path, ProjectPricing, ServiceRoute } from "@/lib/types";
import { PRICING_DEFAULT } from "@/lib/constants";

/** Professional fee by service route (before HST). */
export const ROUTE_PROFESSIONAL_FEES: Record<ServiceRoute, number> = {
  "known-specs": 1480,
  "custom-optimization": 1860,
  "over-22-wwr": 1720,
};

/** Path 2 adds specification review on top of Route 3 base fee. */
export const ROUTE_3_PATH_2_FEE = 1960;

export const ROUTE_PRICING_LABELS: Record<ServiceRoute, string> = {
  "known-specs": "Route 1 — Known specifications",
  "custom-optimization": "Route 2 — Custom optimization",
  "over-22-wwr": "Route 3 — Over 22% WWR",
};

export function professionalFeeForRoute(
  route: ServiceRoute | null,
  over22Path: Over22Path = null,
): number {
  if (!route) return PRICING_DEFAULT.professionalFee;
  if (route === "over-22-wwr" && over22Path === "path-2-help") {
    return ROUTE_3_PATH_2_FEE;
  }
  return ROUTE_PROFESSIONAL_FEES[route];
}

export function calculatePricing(
  professionalFee: number,
  hstRate = PRICING_DEFAULT.hstRate,
): ProjectPricing {
  const fee = professionalFee || PRICING_DEFAULT.professionalFee;
  const hst = Math.round(fee * hstRate * 100) / 100;
  const total = Math.round((fee + hst) * 100) / 100;
  const deposit = Math.round((total / 2) * 100) / 100;
  return {
    professionalFee: fee,
    hst,
    total,
    deposit,
    final: Math.round((total - deposit) * 100) / 100,
  };
}

export function pricingForRoute(
  route: ServiceRoute | null,
  over22Path: Over22Path = null,
): ProjectPricing {
  return calculatePricing(professionalFeeForRoute(route, over22Path));
}

export function routePricingSummary(route: ServiceRoute, over22Path?: Over22Path): string {
  const fee = professionalFeeForRoute(route, over22Path ?? null);
  const { total, deposit } = calculatePricing(fee);
  return `From $${fee.toLocaleString("en-CA")} + HST ($${total.toLocaleString("en-CA")} total · $${deposit.toLocaleString("en-CA")} deposit)`;
}
