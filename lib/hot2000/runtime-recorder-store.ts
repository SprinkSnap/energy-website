import type { CatalogBlobRef } from "@/lib/hot2000/catalog-blob";
import {
  doApplyRecorderCapture,
  doGetRecorderState,
} from "@/lib/hot2000/do-client";
import type { Hot2000RecorderState } from "@/lib/hot2000/recorder-state";
import type { CatalogCaptureMeta } from "@/lib/hot2000/types";

export async function getRecorderState(): Promise<Hot2000RecorderState> {
  return doGetRecorderState();
}

export async function applyCaptureToRecorderState(
  captureJson: string,
  jobId: string,
  meta: Pick<
    CatalogCaptureMeta,
    "section" | "hot2000Version" | "workerId" | "capturedAt" | "fixtureId"
  > = {},
  navigationRef?: CatalogBlobRef,
): Promise<Hot2000RecorderState> {
  return doApplyRecorderCapture(jobId, captureJson, meta, navigationRef);
}
