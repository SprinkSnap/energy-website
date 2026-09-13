import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sessionUserFromSupabase } from "@/lib/supabase/auth-user";
import { isStaffRole } from "@/lib/roles";
import type { Hot2000JobKind } from "@/lib/hot2000/types";

/** Developer-only catalog recorder job kinds — never accepted on the public jobs API. */
export const CATALOG_RECORDER_JOB_KINDS = [
  "catalog_capture",
  "catalog_capture_screen",
  "catalog_resume",
  "catalog_probe",
  "catalog_retry_inaccessible",
] as const;

export type CatalogRecorderJobKind = (typeof CATALOG_RECORDER_JOB_KINDS)[number];

export const CATALOG_RECORDER_ACTIONS = [
  "start_scan",
  "start_full_scan",
  "capture_screen",
  "resume_scan",
  "pause_scan",
  "stop_scan",
  "retry_inaccessible",
  "retry_navigation",
  "run_probe",
  "probe_section",
  "probe_control",
  "retry_ambiguous",
  "retry_failed",
  "pause_probe",
  "resume_probe",
  "stop_probe",
  "generate_catalog",
] as const;

export const CATALOG_SCAN_CONTROL_ACTIONS = [
  "pause",
  "resume",
  "stop",
] as const;

export type CatalogScanControlAction = (typeof CATALOG_SCAN_CONTROL_ACTIONS)[number];

export type CatalogRecorderAction = (typeof CATALOG_RECORDER_ACTIONS)[number];

export function isCatalogRecorderEnabled(): boolean {
  const raw = process.env.HOT2000_CATALOG_RECORDER_ENABLED ?? "";
  return raw.trim().toLowerCase() === "true";
}

export function isCatalogRecorderJobKind(
  kind: string,
): kind is CatalogRecorderJobKind {
  return (CATALOG_RECORDER_JOB_KINDS as readonly string[]).includes(kind);
}

export function isCatalogJobKind(kind: Hot2000JobKind | string): boolean {
  return isCatalogRecorderJobKind(kind);
}

export class CatalogRecorderAuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "CatalogRecorderAuthError";
    this.status = status;
  }
}

export class CatalogRecorderDisabledError extends Error {
  readonly status = 404;
  constructor() {
    super("HOT2000 catalog recorder is not enabled.");
    this.name = "CatalogRecorderDisabledError";
  }
}

/** Require feature flag + authenticated staff user for recorder API routes. */
export async function assertCatalogRecorderAuthorized(): Promise<{
  userId: string;
  role: string;
}> {
  if (!isCatalogRecorderEnabled()) {
    throw new CatalogRecorderDisabledError();
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new CatalogRecorderAuthError(
      "Catalog recorder requires Supabase authentication.",
      503,
    );
  }

  const user = await sessionUserFromSupabase(supabase);
  if (!user) {
    throw new CatalogRecorderAuthError("Authentication required.", 401);
  }
  if (!isStaffRole(user.role)) {
    throw new CatalogRecorderAuthError(
      "Staff or owner role required for catalog recorder.",
      403,
    );
  }

  return { userId: user.id, role: user.role };
}

export function mapActionToJobKind(
  action: string,
): CatalogRecorderJobKind | null {
  switch (action) {
    case "start_scan":
    case "start_full_scan":
      return "catalog_capture";
    case "capture_screen":
      return "catalog_capture_screen";
    case "resume_scan":
      return "catalog_resume";
    case "retry_inaccessible":
      return "catalog_retry_inaccessible";
    case "run_probe":
    case "probe_section":
    case "probe_control":
    case "retry_ambiguous":
    case "retry_failed":
      return "catalog_probe";
    default:
      return null;
  }
}
