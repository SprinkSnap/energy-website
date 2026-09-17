import fixtureManifest from "@/h2k-web-editor/catalog/fixtures/manifest.json";

export function getFixtureManifest(): Record<string, unknown> {
  return fixtureManifest as Record<string, unknown>;
}
