/**
 * Natural Air Infiltration — Leakage Fractions defaults (HOT2000).
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const NA_OTHER = "/HouseFile/House/NaturalAirInfiltration/OtherFactors";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes('ceilings:"0.300"'), "canonical ceilings default 0.300");
assert(appJs.includes('walls:"0.500"'), "canonical walls default 0.500");
assert(appJs.includes('floors:"0.200"'), "canonical floors default 0.200");
assert(appJs.includes("LEAKAGE_FRACTIONS_DECIMALS = 3"), "three decimal display constant");
assert(appJs.includes("function restoreInfiltrationLeakageFractionsDefaults"), "restore helper exists");
assert(appJs.includes("applyInfiltrationLeakageDefaultsForNewFile"), "new-house initializer exists");

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

async function readLeakageFields(page) {
  return page.evaluate(({ NA_OTHER }) => {
    const mode = document.querySelector("[data-infiltration-leakage-mode]");
    const q = (attr) =>
      document.querySelector(`[data-xml-path="${NA_OTHER}/LeakageFractions/@${attr}"]`)?.value ?? "";
    return {
      mode: mode?.value ?? "",
      ceilings: q("ceilings"),
      walls: q("walls"),
      floors: q("floors"),
      ceilingsDisabled:
        document.querySelector(`[data-xml-path="${NA_OTHER}/LeakageFractions/@ceilings"]`)?.disabled === true,
      storedCeilings: getPath(`${NA_OTHER}/LeakageFractions/@ceilings`),
      storedUseDefaults: getPath(`${NA_OTHER}/LeakageFractions/@useDefaults`),
    };
  }, { NA_OTHER });
}

async function gotoOtherFactors(page, base) {
  await page.goto(`${base}/index.html#/systems/natural-air-infiltration`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector(".infiltration-section", { timeout: 90000 });
  await page.click('[data-infiltration-tab="other-factors"]');
  await page.waitForSelector("[data-infiltration-leakage-mode]", { timeout: 90000 });
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
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle2", timeout: 120000 });

  await page.evaluate(() => {
    if (typeof newEmptyModel === "function") newEmptyModel();
  });
  await gotoOtherFactors(page, base);
  let fields = await readLeakageFields(page);
  assert(fields.mode === "defaults", "new house uses defaults mode");
  assert(fields.ceilings === "0.300" && fields.walls === "0.500" && fields.floors === "0.200", "new house default fractions");
  assert(fields.ceilingsDisabled, "defaults mode disables fraction inputs");

  await page.select("[data-infiltration-leakage-mode]", "user");
  await page.waitForFunction(
    () => document.querySelector('[data-xml-path*="/LeakageFractions/@ceilings"]')?.disabled === false,
    { timeout: 30000 },
  );
  await page.evaluate(({ NA_OTHER }) => {
    setPath(`${NA_OTHER}/LeakageFractions/@ceilings`, "0.111");
    setPath(`${NA_OTHER}/LeakageFractions/@walls`, "0.222");
    setPath(`${NA_OTHER}/LeakageFractions/@floors`, "0.333");
    const root = document.querySelector("#screen-systems-natural-air-infiltration");
    if (typeof syncInfiltrationOtherFactors === "function") syncInfiltrationOtherFactors(root);
  }, { NA_OTHER });
  fields = await readLeakageFields(page);
  assert(fields.ceilings === "0.111", "user mode keeps custom ceilings until defaults restored");

  await page.select("[data-infiltration-leakage-mode]", "defaults");
  await page.waitForFunction(
    () => document.querySelector('[data-xml-path*="/LeakageFractions/@ceilings"]')?.value === "0.300",
    { timeout: 30000 },
  );
  fields = await readLeakageFields(page);
  assert(fields.ceilings === "0.300" && fields.walls === "0.500" && fields.floors === "0.200", "Use defaults repopulates");

  await page.evaluate(({ NA_OTHER }) => {
    setPath(`${NA_OTHER}/LeakageFractions/@useDefaults`, "false");
    setPath(`${NA_OTHER}/LeakageFractions/@ceilings`, "0.111");
    setPath(`${NA_OTHER}/LeakageFractions/@walls`, "0.222");
    setPath(`${NA_OTHER}/LeakageFractions/@floors`, "0.333");
    if (typeof restoreInfiltrationLeakageFractionsDefaults === "function") restoreInfiltrationLeakageFractionsDefaults();
    const root = document.querySelector("#screen-systems-natural-air-infiltration");
    if (typeof syncInfiltrationOtherFactors === "function") syncInfiltrationOtherFactors(root);
    const mode = document.querySelector("[data-infiltration-leakage-mode]");
    if (mode) mode.value = "defaults";
  }, { NA_OTHER });
  fields = await readLeakageFields(page);
  assert(fields.storedUseDefaults === "true", "restore sets useDefaults true");
  assert(fields.ceilings === "0.300" && fields.walls === "0.500" && fields.floors === "0.200", "restore defaults values");

  await page.evaluate(({ NA_OTHER }) => {
    setPath(`${NA_OTHER}/LeakageFractions/@useDefaults`, "false");
    setPath(`${NA_OTHER}/LeakageFractions/@ceilings`, "0.444");
    setPath(`${NA_OTHER}/LeakageFractions/@walls`, "0.555");
    setPath(`${NA_OTHER}/LeakageFractions/@floors`, "0.666");
    if (typeof ensureNaturalAirInfiltrationDefaults === "function") ensureNaturalAirInfiltrationDefaults();
  }, { NA_OTHER });
  const preserved = await page.evaluate(({ NA_OTHER }) => ({
    ceilings: getPath(`${NA_OTHER}/LeakageFractions/@ceilings`),
    useDefaults: getPath(`${NA_OTHER}/LeakageFractions/@useDefaults`),
  }), { NA_OTHER });
  assert(preserved.ceilings === "0.444", "ensureNaturalAirInfiltrationDefaults does not overwrite saved fractions");
  assert(preserved.useDefaults === "false", "ensureNaturalAirInfiltrationDefaults preserves user mode");

  await browser.close();
  server.close();
  console.log("infiltration-leakage-fractions-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
