/**
 * Blower operating condition sync (main Test Type ↔ Air Leakage Test Conditions)
 * and equipment Test Type dropdown options.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

const EQUIPMENT_OPTIONS = [
  "1 blower - whole house",
  "2 blowers - whole house",
  "1 blower - Duplex",
  "1 blower - Triplex",
  "2 blowers - Triplex",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function applyInfiltrationBlowerCondition"), "shared blower condition helper");
assert(appJs.includes('"2 blowers - whole house"'), "equipment test type options expanded");

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
  await page.waitForSelector("[data-infiltration-air-leakage]", { timeout: 90000 });
}

async function setAirLeakChecked(page, checked) {
  await page.evaluate((checked) => {
    const el = document.querySelector("[data-infiltration-air-leakage]");
    if (!el || el.disabled) throw new Error("Air Leakage Test Data not available");
    if (el.checked !== checked) el.click();
  }, checked);
  await page.waitForFunction(
    (checked) => document.querySelector("[data-infiltration-air-leakage]")?.checked === checked,
    { timeout: 30000 },
    checked,
  );
}

async function readConditionState(page) {
  return page.evaluate(() => {
    const main = document.querySelector("[data-infiltration-test-type]");
    const operated = document.querySelector('[data-infiltration-alt-cgsb][value="operated"]');
    const cgsb = document.querySelector('[data-infiltration-alt-cgsb][value="cgsb"]');
    return {
      mainValue: main?.value ?? "",
      mainOptions: [...(main?.options || [])].map((o) => o.textContent.trim()),
      altOperated: operated?.checked === true,
      altCgsb: cgsb?.checked === true,
      isCgsbTest: getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@isCgsbTest"),
      hasCgsbConditions: getPath(
        "/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/@hasCgsbConditions",
      ),
    };
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
  await gotoInfiltration(page, base);
  await setAirLeakChecked(page, true);
  await page.click('[data-infiltration-tab="air-leakage-test-data"]');

  let state = await readConditionState(page);
  assert(state.mainOptions.join("|") === "As operated|CGSB", "main Test Type shows operating options only");
  assert(state.mainValue === "operated" && state.altOperated, "default As operated synced");
  assert(String(state.isCgsbTest).toLowerCase() === "false", "model isCgsbTest false by default");

  const equipSel = await page.$(
    '[data-xml-path="/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/TestType"]',
  );
  const equipLabels = await page.evaluate((sel) => [...sel.options].map((o) => o.textContent.trim()), equipSel);
  assert(equipLabels.join("\n") === EQUIPMENT_OPTIONS.join("\n"), `equipment options ${equipLabels}`);
  assert((await page.evaluate((sel) => sel.value, equipSel)) === "0", "default equipment code 0");

  await page.select("[data-infiltration-test-type]", "cgsb");
  await page.waitForFunction(
    () =>
      document.querySelector('[data-infiltration-alt-cgsb][value="cgsb"]')?.checked === true &&
      getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@isCgsbTest") === "true",
    { timeout: 30000 },
  );
  state = await readConditionState(page);
  assert(state.mainValue === "cgsb" && state.altCgsb, "main CGSB updates Test Conditions");

  await page.evaluate(() => {
    const op = document.querySelector('[data-infiltration-alt-cgsb][value="operated"]');
    op?.click();
  });
  await page.waitForFunction(
    () =>
      document.querySelector("[data-infiltration-test-type]")?.value === "operated" &&
      getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@isCgsbTest") === "false",
    { timeout: 30000 },
  );

  await page.evaluate(() => {
    setCoded(
      "/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/TestType",
      "1",
      AIR_LEAKAGE_BLOWER_TEST_TYPES,
    );
    applyInfiltrationBlowerCondition(true);
    saveSession();
    renderAirtightness();
  });
  await page.waitForSelector('[data-infiltration-tab="air-leakage-test-data"]', { timeout: 30000 });
  await page.click('[data-infiltration-tab="air-leakage-test-data"]');
  const persisted = await page.evaluate(() => ({
    equip: getPath("/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/TestType/@code"),
    cgsb: getPath("/HouseFile/House/NaturalAirInfiltration/Specifications/BlowerTest/@isCgsbTest"),
    cond: getPath("/HouseFile/House/NaturalAirInfiltration/AirLeakageTestData/@hasCgsbConditions"),
  }));
  assert(persisted.equip === "1", "equipment test type persists independently");
  assert(persisted.cgsb === "true" && persisted.cond === "true", "operating condition persists");

  await browser.close();
  server.close();
  console.log("infiltration-test-type-sync-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
