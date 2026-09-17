import { RECORDER_FIXTURE_XML } from "./generated-recorder-fixture";

/** Bundled recorder fixture XML (generated at build time; no runtime fs or .h2k imports). */
export function recorderFixtureXml(): string {
  if (
    typeof RECORDER_FIXTURE_XML !== "string" ||
    !RECORDER_FIXTURE_XML.trim()
  ) {
    throw new Error("Bundled HOT2000 recorder fixture is unavailable.");
  }

  return RECORDER_FIXTURE_XML;
}

export function assertRecorderJobFixture(xml: string, sourceHash: string): void {
  if (typeof xml !== "string" || !xml.trim()) {
    throw new Error("Bundled HOT2000 recorder fixture is unavailable.");
  }

  if (!xml.includes("<?xml") || !/<HouseFile[\s>]/.test(xml)) {
    throw new Error("Bundled HOT2000 recorder fixture is not valid H2K XML.");
  }

  if (typeof sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(sourceHash)) {
    throw new Error("Invalid H2K source hash.");
  }
}
