import baselineGeneralH2k from "../../workers/hot2000/fixtures/baseline-general.h2k";

/** Bundled recorder fixture XML (no runtime filesystem reads). */
export function recorderFixtureXml(): string {
  return baselineGeneralH2k;
}
