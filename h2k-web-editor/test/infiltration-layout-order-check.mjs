/**
 * Natural Air Infiltration specifications layout order and responsive structure.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("infiltration-air-tightness-group"), "Air Tightness Type subsection separated");
assert(appJs.includes("infiltration-blower-group"), "Blower Test subsection after tightness");
assert(appJs.includes("infiltration-house-row"), "House row layout class");
assert(stylesCss.includes(".infiltration-specifications-section .infiltration-blower-check-row"), "Blower checkbox row CSS");

const REQUIRED_CONTROLS = [
  "House Volume",
  "Includes crawlspace volume",
  "Air Tightness Type",
  "Guarded",
  "Air Change Rate @ 50 Pa.",
  "Test Type",
  "Equivalent Leakage Area",
  "Terrain",
  "Depressurization test status:",
];

const SECTION_ORDER = [
  "House",
  "Air Tightness Type",
  "Blower Test",
  "Building Site",
  "Exhaust Devices Test",
  "Local Shielding",
  "Area of common surfaces",
];

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mjs": "text/javascript",
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const rel = decodeURIComponent((req.url || "/").split("?")[0]);
      const filePath = join(root, rel === "/" ? "index.html" : rel.replace(/^\//, ""));
      if (!filePath.startsWith(root) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function run() {
  const puppeteerPaths = [
    "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
    join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
  ];
  let puppeteer;
  for (const p of puppeteerPaths) {
    if (!existsSync(p)) continue;
    puppeteer = await import(pathToFileURL(p).href);
    break;
  }
  if (!puppeteer) throw new Error("Install puppeteer-core to run checks");

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto(`${base}/index.html#/systems/natural-air-infiltration`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#infiltration-specifications-mount .infiltration-specifications-stack", {
    timeout: 90000,
  });

  const structure = await page.evaluate(({ SECTION_ORDER, REQUIRED_CONTROLS }) => {
    const stack = document.querySelector(".infiltration-specifications-stack");
    const headings = [...(stack?.querySelectorAll(":scope > .spec-group > h4") || [])].map((h) =>
      h.textContent.trim(),
    );
    const houseGroup = stack?.querySelector(".infiltration-house-group");
    const tightnessGroup = stack?.querySelector(".infiltration-air-tightness-group");
    const blowerGroup = stack?.querySelector(".infiltration-blower-group");
    const buildingGroup = stack?.querySelector(".infiltration-building-site-group");
    const text = stack?.textContent || "";
    const missingControls = REQUIRED_CONTROLS.filter((label) => !text.includes(label));
    const ach = document.querySelector(
      '[data-xml-path="/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@airChangeRate"]',
    );
    const guarded = document.querySelector("[data-infiltration-guarded]");
    return {
      headings,
      houseHasTightnessSelect: !!houseGroup?.querySelector('[data-xml-path*="AirTightnessTest"]'),
      tightnessHasSelect: !!tightnessGroup?.querySelector('[data-xml-path*="AirTightnessTest"]'),
      orderOk:
        headings.indexOf("House") < headings.indexOf("Air Tightness Type") &&
        headings.indexOf("Air Tightness Type") < headings.indexOf("Blower Test") &&
        headings.indexOf("Blower Test") < headings.indexOf("Building Site"),
      domOrderOk: !!(
        houseGroup &&
        tightnessGroup &&
        blowerGroup &&
        buildingGroup &&
        houseGroup.compareDocumentPosition(tightnessGroup) & Node.DOCUMENT_POSITION_FOLLOWING &&
        tightnessGroup.compareDocumentPosition(blowerGroup) & Node.DOCUMENT_POSITION_FOLLOWING &&
        blowerGroup.compareDocumentPosition(buildingGroup) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      missingControls,
      presetAchDisabled: ach?.disabled === true,
      presetGuardedEnabled: guarded?.disabled !== true,
      expectedHeadings: SECTION_ORDER,
    };
  }, { SECTION_ORDER, REQUIRED_CONTROLS });

  assert(JSON.stringify(structure.headings) === JSON.stringify(SECTION_ORDER), `section order ${structure.headings}`);
  assert(structure.orderOk && structure.domOrderOk, "Air Tightness Type precedes Blower Test precedes Building Site");
  assert(!structure.houseHasTightnessSelect && structure.tightnessHasSelect, "tightness dropdown in own section");
  assert(structure.missingControls.length === 0, `missing controls: ${structure.missingControls.join(", ")}`);

  await page.evaluate(() => {
    const sel = document.querySelector(
      '[data-xml-path="/HouseFile/House/NaturalAirInfiltration/Specifications/House/AirTightnessTest"]',
    );
    sel.dataset.infiltrationPrevCode = "x";
    sel.value = "B";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForSelector("#infiltration-specifications-mount .infiltration-specifications-stack", {
    timeout: 90000,
  });
  const presetState = await page.evaluate(() => {
    const ach = document.querySelector(
      '[data-xml-path="/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@airChangeRate"]',
    );
    const guarded = document.querySelector("[data-infiltration-guarded]");
    return { achDisabled: ach?.disabled === true, guardedEnabled: guarded?.disabled !== true };
  });
  assert(presetState.achDisabled && presetState.guardedEnabled, "preset still disables ACH only; Guarded stays enabled");

  let horizontalOverflow = false;
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 150));
    const metrics = await page.evaluate((width) => {
      const section = document.querySelector("#screen-systems-natural-air-infiltration .infiltration-section");
      const stack = document.querySelector(".infiltration-specifications-stack");
      const checkRow = stack?.querySelector(".infiltration-blower-check-row");
      const checks = [...(checkRow?.querySelectorAll(".check") || [])];
      const hasAirLeakLabel = checks.some((el) => el.textContent.includes("Air Leakage Test Data"));
      return {
        overflow: (section?.scrollWidth || 0) > (section?.clientWidth || 0) + 2,
        checkCount: checks.length,
        hasAirLeakLabel,
        width,
      };
    }, width);
    if (metrics.overflow) horizontalOverflow = true;
    assert(metrics.checkCount === 1, `single Guarded checkbox in blower row at ${width}px`);
    assert(!metrics.hasAirLeakLabel, `no Air Leakage Test Data label at ${width}px`);
  }
  assert(!horizontalOverflow, "horizontal overflow at tested widths");

  await browser.close();
  server.close();
  console.log("infiltration-layout-order-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
