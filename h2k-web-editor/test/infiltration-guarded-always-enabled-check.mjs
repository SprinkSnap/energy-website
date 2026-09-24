/**
 * Blower Test → Guarded checkbox is always enabled regardless of Air Tightness / ELA mode.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!appJs.includes("if(guarded) guarded.disabled=preset"), "removed preset disable on Guarded in sync");
assert(
  !/data-infiltration-guarded[^`]*\$\{preset\?" disabled"/.test(appJs),
  "removed preset disabled attribute from Guarded markup",
);

const TIGHTNESS_PATH = "/HouseFile/House/NaturalAirInfiltration/Specifications/House/AirTightnessTest";
const BLOWER_PATH = "/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest";
const TIGHTNESS_CODES = [
  ["Blower door test values", "x"],
  ["Loose", "A"],
  ["Average", "B"],
  ["Present", "C"],
  ["Energy tight", "D"],
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

async function gotoSpecifications(page, base) {
  await page.goto(`${base}/index.html#/systems/natural-air-infiltration`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("[data-infiltration-guarded]", { timeout: 90000 });
}

async function selectTightness(page, code) {
  await page.evaluate(({ TIGHTNESS_PATH, code }) => {
    const sel = document.querySelector(`[data-xml-path="${TIGHTNESS_PATH}"]`);
    if (!sel) throw new Error("Air Tightness Type select missing");
    sel.dataset.infiltrationPrevCode =
      typeof infiltrationAirTightnessCode === "function" ? infiltrationAirTightnessCode() : sel.value;
    sel.value = code;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, { TIGHTNESS_PATH, code });
  await page.waitForFunction(
    (expected) => {
      const sel = document.querySelector(
        '[data-xml-path="/HouseFile/House/NaturalAirInfiltration/Specifications/House/AirTightnessTest"]',
      );
      return sel?.value === expected;
    },
    { timeout: 30000 },
    code,
  );
}

async function readGuardedState(page) {
  return page.evaluate(({ BLOWER_PATH }) => {
    const el = document.querySelector("[data-infiltration-guarded]");
    const ach = document.querySelector(`[data-xml-path="${BLOWER_PATH}/@airChangeRate"]`);
    const testType = document.querySelector("[data-infiltration-test-type]");
    return {
      disabled: el?.disabled === true,
      checked: el?.checked === true,
      modelGuarded: getPath(`${BLOWER_PATH}/@guarded`),
      achDisabled: ach?.disabled === true,
      testTypeDisabled: testType?.disabled === true,
    };
  }, { BLOWER_PATH });
}

async function setGuardedChecked(page, checked) {
  await page.evaluate((checked) => {
    const el = document.querySelector("[data-infiltration-guarded]");
    if (!el) throw new Error("Guarded checkbox missing");
    if (el.disabled) throw new Error("Guarded must not be disabled");
    if (el.checked !== checked) el.click();
  }, checked);
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector("[data-infiltration-guarded]");
      return el?.checked === expected;
    },
    { timeout: 10000 },
    checked,
  );
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
  await gotoSpecifications(page, base);

  for (const [label, code] of TIGHTNESS_CODES) {
    await selectTightness(page, code);
    let state = await readGuardedState(page);
    assert(!state.disabled, `${label} (${code}): Guarded enabled`);
    await setGuardedChecked(page, true);
    state = await readGuardedState(page);
    assert(state.checked && String(state.modelGuarded).toLowerCase() === "true", `${label}: Guarded toggles on`);
    await setGuardedChecked(page, false);
    state = await readGuardedState(page);
    assert(!state.checked && String(state.modelGuarded).toLowerCase() === "false", `${label}: Guarded toggles off`);
  }

  await selectTightness(page, "x");
  let blowerDoor = await readGuardedState(page);
  assert(!blowerDoor.disabled, "Guarded enabled in blower door test values mode");
  await setGuardedChecked(page, true);
  blowerDoor = await readGuardedState(page);
  assert(blowerDoor.checked, "Guarded toggles on in blower door mode");

  await selectTightness(page, "B");
  const preset = await readGuardedState(page);
  assert(preset.achDisabled && preset.testTypeDisabled, "preset still disables other blower fields");
  assert(!preset.disabled, "Guarded enabled on Average preset");

  await page.evaluate(({ BLOWER_PATH }) => {
    setPath(`${BLOWER_PATH}/@guarded`, "true");
    if (typeof renderAirtightness === "function") renderAirtightness();
  }, { BLOWER_PATH });
  await page.waitForSelector("[data-infiltration-guarded]", { timeout: 90000 });
  const restored = await readGuardedState(page);
  assert(restored.checked && !restored.disabled, "saved guarded=true restores after re-render");

  await page.goto(`${base}/index.html#/systems/ventilation`, { waitUntil: "networkidle2", timeout: 120000 });
  await gotoSpecifications(page, base);
  await selectTightness(page, "B");
  const afterNav = await readGuardedState(page);
  assert(afterNav.checked && !afterNav.disabled, "Guarded state persists through navigation");

  await browser.close();
  server.close();
  console.log("infiltration-guarded-always-enabled-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
