/**
 * Blower operating condition sync (main Test Type ↔ AirLeakageTestData/@hasCgsbConditions)
 * and equipment Test Type model codes (no separate Air Leakage Test Data UI tab).
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

assert(appJs.includes("function applyInfiltrationBlowerCondition"), "shared blower condition helper");
assert(appJs.includes('"2 blowers - whole house"'), "equipment test type options in model");
assert(!appJs.includes("data-infiltration-air-leakage"), "no air leakage checkbox in UI");

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

async function gotoInfiltration(page, base) {
  await page.goto(`${base}/index.html#/systems/natural-air-infiltration`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("[data-infiltration-test-type]", { timeout: 90000 });
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
  await gotoInfiltration(page, base);

  const nav = await page.evaluate(() => ({
    altTab: !!document.querySelector('[data-infiltration-tab="air-leakage-test-data"]'),
    mainValue: document.querySelector("[data-infiltration-test-type]")?.value ?? "",
    mainOptions: [...(document.querySelector("[data-infiltration-test-type]")?.options || [])].map((o) =>
      o.textContent.trim(),
    ),
    isCgsbTest: getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@isCgsbTest"),
    hasCgsbConditions: getPath(
      "/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/@hasCgsbConditions",
    ),
  }));
  assert(!nav.altTab, "no Air Leakage Test Data tab");
  assert(nav.mainOptions.join("|") === "As operated|CGSB", "main Test Type shows operating options only");
  assert(nav.mainValue === "operated", "default As operated");
  assert(String(nav.isCgsbTest).toLowerCase() === "false", "model isCgsbTest false by default");

  await page.select("[data-infiltration-test-type]", "cgsb");
  await page.waitForFunction(
    () =>
      getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@isCgsbTest") === "true",
    { timeout: 30000 },
  );

  await page.select("[data-infiltration-test-type]", "operated");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-infiltration-test-type]")?.value === "operated" &&
      getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@isCgsbTest") === "false",
    { timeout: 30000 },
  );

  await page.evaluate(() => {
    ensureAirLeakageTestDataStructure({ enabled: true });
    setCoded(
      "/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/TestType",
      "1",
      AIR_LEAKAGE_BLOWER_TEST_TYPES,
    );
    applyInfiltrationBlowerCondition(true);
    saveSession();
    renderAirtightness();
  });

  const persisted = await page.evaluate(() => ({
    equip: getPath("/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/TestType/@code"),
    cgsb: getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@isCgsbTest"),
    cond: getPath("/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/@hasCgsbConditions"),
    altTab: !!document.querySelector('[data-infiltration-tab="air-leakage-test-data"]'),
  }));
  assert(persisted.equip === "1", "equipment test type persists in model");
  assert(persisted.cgsb === "true" && persisted.cond === "true", "operating condition persists in model");
  assert(!persisted.altTab, "still no air leakage tab after model edits");

  await browser.close();
  server.close();
  console.log("infiltration-test-type-sync-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
