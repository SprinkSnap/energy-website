import assert from "node:assert/strict";
import { normalizeRawDesktopCapture } from "../catalog/normalize-desktop-capture.mjs";

const raw = {
  hot2000Version: "11.13",
  scanId: "abc123",
  screenFiles: [
    {
      key: "weather-screen",
      section: "weather",
      windowTitle: "Weather",
      controls: [
        {
          stableId: "combo-region",
          controlType: "ComboBox",
          label: "Weather region",
          options: [
            { index: 0, label: "Ontario" },
            { index: 1, label: "Quebec" },
          ],
          enumerationStatus: "success",
        },
        {
          stableId: "field-hdd",
          controlType: "Edit",
          label: "Heating degree days",
          value: "4500",
        },
      ],
      inaccessibleControls: [],
    },
  ],
};

const { manifest, screens } = normalizeRawDesktopCapture(raw);

assert.equal(manifest.schemaVersion, "2.0.0");
assert.equal(manifest.mappingPolicy, "no-guessed-xml-paths");
assert.equal(screens.length, 1);
assert.equal(screens[0].sectionId, "weather");
assert.equal(screens[0].fields.length, 2);

for (const field of screens[0].fields) {
  assert.equal(field.xmlPath, null);
  assert.equal(field.mappingStatus, "unmapped");
  assert.equal(field.path, undefined);
}

const combo = screens[0].fields.find((f) => f.id === "combo-region");
assert.ok(combo.optionLabels?.length === 2);
assert.equal(combo.comboEnumerationStatus, "success");

console.log("normalize-desktop-capture.test.mjs passed");
