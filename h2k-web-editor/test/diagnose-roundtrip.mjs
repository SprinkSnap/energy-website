/**
 * A/B H2K corruption isolation harness.
 *
 * Generates controlled round-trip diagnostic files from template.h2k and
 * structural/textual diff reports for HOT2000 Desktop manual acceptance testing.
 *
 * Usage: node h2k-web-editor/test/diagnose-roundtrip.mjs
 */

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { chromium } from "playwright";

import {
  applyHot2000DesktopCompatibility,
  loadH2kTemplateSync,
  parseH2kXml,
  patchEditorValuesIntoTemplate,
  serializeDocument,
  serializeModelUsingTemplate,
  setCachedTemplateText,
  stripCalculationResults,
} from "../h2k-template-serializer.mjs";

import {
  compareXmlStrings,
  serializeDocRoot,
} from "./h2k-xml-diff.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = join(root, "template.h2k");
const outDir = join(root, "test-output", "roundtrip-diagnosis");

const templateBytes = readFileSync(templatePath);
const templateText = templateBytes.toString("utf8");

const parserOpts = { DOMParserImpl: DOMParser, XMLSerializerImpl: XMLSerializer };

setCachedTemplateText(templateText);

function writeOutput(name, content) {
  const filePath = join(outDir, name);
  writeFileSync(filePath, content, typeof content === "string" ? "utf8" : undefined);
  return filePath;
}

function writeDiffReport(filename, generatedText) {
  const report = compareXmlStrings(templateText, generatedText, (text) =>
    parseH2kXml(text, DOMParser),
  );
  writeOutput(`${filename}.diff.json`, JSON.stringify(report, null, 2));
  return report;
}

function cloneTemplateDoc() {
  const doc = loadH2kTemplateSync(templateText, DOMParser);
  return doc.cloneNode(true);
}

function generate01ParseSerializeOnly() {
  const doc = parseH2kXml(templateText, DOMParser);
  return serializeDocRoot(doc, XMLSerializer);
}

function generate02PatchUnchangedModel() {
  const templateClone = loadH2kTemplateSync(templateText, DOMParser);
  const modelDoc = loadH2kTemplateSync(templateText, DOMParser);
  patchEditorValuesIntoTemplate(templateClone, modelDoc);
  return serializeDocument(templateClone, XMLSerializer);
}

function generate03StripAllResultsOnly() {
  const doc = loadH2kTemplateSync(templateText, DOMParser);
  stripCalculationResults(doc);
  return serializeDocument(doc, XMLSerializer);
}

function generate04CompatibilityOnly() {
  const doc = loadH2kTemplateSync(templateText, DOMParser);
  applyHot2000DesktopCompatibility(doc);
  return serializeDocument(doc, XMLSerializer);
}

function generate05AllResultsPlusCompatibility() {
  const doc = loadH2kTemplateSync(templateText, DOMParser);
  stripCalculationResults(doc);
  applyHot2000DesktopCompatibility(doc);
  return serializeDocument(doc, XMLSerializer);
}

function generate06CurrentFullSerializer() {
  const modelDoc = loadH2kTemplateSync(templateText, DOMParser);
  return serializeModelUsingTemplate(modelDoc, {
    templateText,
    forHot2000: true,
    ...parserOpts,
  });
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = req.url?.split("?")[0] || "/";
      const rel = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = join(root, rel.replace(/^\//, ""));
      try {
        const data = readFileSync(filePath);
        const ext = filePath.split(".").pop();
        const types = {
          html: "text/html",
          js: "text/javascript",
          mjs: "text/javascript",
          css: "text/css",
          h2k: "application/xml",
        };
        res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function generate07BrowserEquivalentRoundtrip() {
  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => globalThis.H2kTemplateSerializer?.getCachedTemplateText?.());
    await page.waitForFunction(() => typeof globalThis.__h2kDiagnoseBrowserRoundtrip === "function");

    const result = await page.evaluate(async (tpl) => {
      return globalThis.__h2kDiagnoseBrowserRoundtrip(tpl);
    }, templateText);

    const validationDiffs = {
      "A_vs_original": compareSnapshotPair(
        "original template → A_afterImport (loadDoc complete)",
        templateText,
        result.snapshots.A_afterImport,
      ),
      "A_to_B": compareSnapshotPair(
        "A_afterImport → B_beforeValidateClick",
        result.snapshots.A_afterImport,
        result.snapshots.B_beforeValidateClick,
      ),
      "B_to_C": compareSnapshotPair(
        "B_beforeValidateClick → C_afterValidateClick",
        result.snapshots.B_beforeValidateClick,
        result.snapshots.C_afterValidateClick,
      ),
      "C_to_D": compareSnapshotPair(
        "C_afterValidateClick → D_beforeSerializeForExport",
        result.snapshots.C_afterValidateClick,
        result.snapshots.D_beforeSerializeForExport,
      ),
      validationMutatesXml: result.validationMutatesXml,
      labels: result.labels,
    };

    writeOutput(
      "validation-snapshots.diff.json",
      JSON.stringify(validationDiffs, null, 2),
    );
    writeOutput(
      "validation-snapshots.json",
      JSON.stringify(
        {
          note: "XML snapshots at import/validate/export checkpoints (documentElement only, no declaration).",
          labels: result.labels,
          snapshotLineCounts: Object.fromEntries(
            Object.entries(result.snapshots).map(([k, v]) => [k, v.split("\n").length]),
          ),
        },
        null,
        2,
      ),
    );

    writeOutput("A-after-import-snapshot.h2k", result.snapshots.A_afterImport);
    writeOutput("D-before-serialize-snapshot.h2k", result.snapshots.D_beforeSerializeForExport);

    return result.exported;
  } finally {
    await browser.close();
    server.close();
  }
}

function compareSnapshotPair(label, beforeText, afterText) {
  return {
    label,
    ...compareXmlStrings(beforeText, afterText, (text) => {
      const doc = parseH2kXml(
        text.startsWith("<?xml") ? text : `<?xml version="1.0" encoding="UTF-8"?>\n${text}`,
        DOMParser,
      );
      return doc;
    }).structural,
  };
}

function buildSummaryReport(files, reports) {
  const lines = [
    "# H2K Round-Trip Diagnosis Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Files Created",
    "",
    ...files.map((f) => `- \`${f}\``),
    "",
    "## Transformations (01–07)",
    "",
    "| File | Transformation |",
    "|------|----------------|",
    "| 00-original-template.h2k | Exact byte copy of template.h2k |",
    "| 01-parse-serialize-only.h2k | DOMParser → XMLSerializer only |",
    "| 02-template-patch-unchanged-model.h2k | patchEditorValuesIntoTemplate only |",
    "| 03-strip-allresults-only.h2k | stripCalculationResults only |",
    "| 04-compatibility-only.h2k | applyHot2000DesktopCompatibility only |",
    "| 05-allresults-plus-compatibility.h2k | stripCalculationResults + applyHot2000DesktopCompatibility |",
    "| 06-current-full-serializer.h2k | serializeModelUsingTemplate({ forHot2000: true }) |",
    "| 07-browser-equivalent-roundtrip.h2k | Full browser import → Validate → Export path |",
    "",
    "## Subtree Hash Differences (vs original)",
    "",
  ];

  for (const [name, report] of Object.entries(reports)) {
    if (name === "00") continue;
    const differ = report.subtreeHashes?.differ || [];
    lines.push(`### ${name}`);
    lines.push(differ.length ? `- Changed sections: ${differ.join(", ")}` : "- No subtree hash changes");
    lines.push("");
  }

  lines.push("## Structural Change Counts (vs original)");
  lines.push("");
  lines.push("| File | Attrs | Text | Added | Removed | Reordered |");
  lines.push("|------|-------|------|-------|---------|-----------|");

  for (const [name, report] of Object.entries(reports)) {
    if (name === "00") continue;
    const s = report.structural;
    lines.push(
      `| ${name} | ${s.attributesChanged.length} | ${s.textChanged.length} | ${s.nodesAdded.length} | ${s.nodesRemoved.length} | ${s.nodesMovedOrReordered.length} |`,
    );
  }

  lines.push("");
  lines.push("## Encoding / Declaration Differences");
  lines.push("");
  for (const [name, report] of Object.entries(reports)) {
    if (name === "00") continue;
    const enc = report.encoding;
    if (
      enc.original.declaration !== enc.generated.declaration
      || enc.original.hasBom !== enc.generated.hasBom
    ) {
      lines.push(`- **${name}**: declaration or BOM differs`);
      lines.push(`  - original: ${JSON.stringify(enc.original)}`);
      lines.push(`  - generated: ${JSON.stringify(enc.generated)}`);
    }
  }

  lines.push("");
  lines.push("## Strongest Evidence-Backed Suspects (pre-HOT2000 manual test)");
  lines.push("");
  lines.push("Pending HOT2000 Desktop PASS/FAIL on files 01–06. See `HOT2000_RESULTS.md`.");
  lines.push("");
  lines.push("Automated observations from this run:");
  for (const [name, report] of Object.entries(reports)) {
    if (name === "00") continue;
    const suspects = [];
    if (report.structural.nodesRemoved.some((n) => n.path.includes("AllResults"))) {
      suspects.push("AllResults subtree removed");
    }
    if (report.structural.attributesChanged.some((a) => a.attribute === "ratePeriod")) {
      suspects.push("FuelCosts/@ratePeriod changed");
    }
    if (report.structural.attributesChanged.some((a) => a.attribute === "userSpecifiedUsage")) {
      suspects.push("BaseLoads/@userSpecifiedUsage changed");
    }
    if (report.structural.attributesChanged.some((a) => a.attribute === "installed")) {
      suspects.push("appliance @installed changed");
    }
    if (report.textual.changedLineCount > 0) {
      suspects.push(`${report.textual.changedLineCount} raw text line(s) differ`);
    }
    if (suspects.length) {
      lines.push(`- **${name}**: ${suspects.join("; ")}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const files = [];
  const reports = {};

  // 00 — exact byte copy
  writeOutput("00-original-template.h2k", templateBytes);
  files.push("00-original-template.h2k");

  const steps = [
    ["01-parse-serialize-only.h2k", generate01ParseSerializeOnly],
    ["02-template-patch-unchanged-model.h2k", generate02PatchUnchangedModel],
    ["03-strip-allresults-only.h2k", generate03StripAllResultsOnly],
    ["04-compatibility-only.h2k", generate04CompatibilityOnly],
    ["05-allresults-plus-compatibility.h2k", generate05AllResultsPlusCompatibility],
    ["06-current-full-serializer.h2k", generate06CurrentFullSerializer],
  ];

  for (const [filename, generator] of steps) {
    const xml = generator();
    writeOutput(filename, xml);
    const key = filename.replace(".h2k", "").slice(0, 2);
    reports[key] = writeDiffReport(filename.replace(".h2k", ""), xml);
    files.push(filename);
    files.push(`${filename.replace(".h2k", "")}.diff.json`);
    console.log(`Wrote ${filename}`);
  }

  console.log("Running browser-equivalent roundtrip (07)…");
  const browserXml = await generate07BrowserEquivalentRoundtrip();
  writeOutput("07-browser-equivalent-roundtrip.h2k", browserXml);
  reports["07"] = writeDiffReport("07-browser-equivalent-roundtrip", browserXml);
  files.push("07-browser-equivalent-roundtrip.h2k");
  files.push("07-browser-equivalent-roundtrip.diff.json");
  files.push("validation-snapshots.json");
  files.push("validation-snapshots.diff.json");
  console.log("Wrote 07-browser-equivalent-roundtrip.h2k");

  writeOutput(
    "HOT2000_RESULTS.md",
    [
      "# HOT2000 Desktop Manual Acceptance",
      "",
      "| File | HOT2000 result |",
      "|------|----------------|",
      "| 00-original-template.h2k | PASS |",
      "| 01-parse-serialize-only.h2k | UNKNOWN |",
      "| 02-template-patch-unchanged-model.h2k | UNKNOWN |",
      "| 03-strip-allresults-only.h2k | UNKNOWN |",
      "| 04-compatibility-only.h2k | UNKNOWN |",
      "| 05-allresults-plus-compatibility.h2k | UNKNOWN |",
      "| 06-current-full-serializer.h2k | UNKNOWN |",
      "| 07-browser-equivalent-roundtrip.h2k | FAIL |",
      "",
      "Record PASS/FAIL after opening each file in HOT2000 Desktop.",
      "The first file that changes PASS → FAIL identifies the corruption source.",
    ].join("\n"),
  );
  files.push("HOT2000_RESULTS.md");

  writeOutput("DIAGNOSIS_SUMMARY.md", buildSummaryReport(files, reports));

  const templateHash = createHash("sha256").update(templateBytes).digest("hex");
  writeOutput(
    "manifest.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        templatePath,
        templateSha256: templateHash,
        templateByteLength: templateBytes.length,
        files,
      },
      null,
      2,
    ),
  );
  files.push("DIAGNOSIS_SUMMARY.md");
  files.push("manifest.json");

  console.log(`\nDiagnosis complete. Output: ${outDir}`);
  console.log(`Files: ${files.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
