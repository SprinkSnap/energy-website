import { HOT2000_JOB_KINDS, type Hot2000JobKind } from "@/lib/hot2000/types";

export const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

export function assertValidJobInputXml(inputXml: unknown): string {
  if (typeof inputXml !== "string" || !inputXml.trim()) {
    throw new Error("inputXml must be a non-empty string.");
  }
  return inputXml;
}

export function assertValidSourceHash(sourceHash: unknown): string {
  if (typeof sourceHash !== "string" || !SHA256_HEX_RE.test(sourceHash)) {
    throw new Error("sourceHash must be a 64-character SHA-256 hex string.");
  }
  return sourceHash;
}

export function assertValidJobKind(kind: unknown): Hot2000JobKind {
  const resolved =
    typeof kind === "string" && kind.trim() ? kind.trim() : "calculate";
  if (!HOT2000_JOB_KINDS.includes(resolved as Hot2000JobKind)) {
    throw new Error("Invalid job kind.");
  }
  return resolved as Hot2000JobKind;
}

export function assertValidCatalogAction(
  catalogAction: unknown,
  kind: Hot2000JobKind,
): string {
  const action =
    typeof catalogAction === "string" && catalogAction.trim()
      ? catalogAction.trim()
      : kind;
  if (typeof action !== "string" || !action.trim()) {
    throw new Error("catalogAction must be a non-empty string.");
  }
  return action;
}
