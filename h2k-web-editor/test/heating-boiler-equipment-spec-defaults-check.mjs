/**
 * Boiler equipment-specific HOT2000 defaults by energy source + equipment type.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const BOILER_PATH = "/HouseFile/House/HeatingCooling/Type1/Boiler";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("const BOILER_EQUIP_SPECS"), "BOILER_EQUIP_SPECS map");
assert(appJs.includes("function heatingBoilerApplyEquipmentSpecs"), "apply equipment specs helper");
assert(appJs.includes("function heatingBoilerSpecFor"), "spec lookup helper");
assert(appJs.includes('boilerHot2000Spec(90, false, 0, 0)'), "oil condensing AFUE spec");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mjs": "text/javascript",
};

/** [fuelCode, equipCode, efficiency, steadyState, pilot, flue] */
const SCREENSHOT_SPECS = [
  ["1", "4", "100", true, "0", "0"],
  ["2", "1", "77", true, "999.2", "6"],
  ["2", "2", "78", true, "0", "5"],
  ["2", "3", "78", true, "0", "4"],
  ["2", "4", "80", true, "0", "0"],
  ["2", "5", "90", true, "0", "0"],
  ["3", "1", "71", true, "0", "6"],
  ["3", "2", "71", true, "0", "5"],
  ["3", "3", "83", true, "0", "5"],
  ["3", "4", "85", true, "0", "0"],
  ["3", "5", "90", false, "0", "0"],
  ["3", "6", "87", true, "0", "0"],
  ["4", "1", "80", true, "999.2", "6"],
  ["4", "2", "80", true, "0", "5"],
  ["4", "3", "80", true, "0", "4"],
  ["4", "4", "82", true, "0", "0"],
  ["4", "5", "91", true, "0", "0"],
  ["5", "1", "50", true, "0", "8"],
  ["5", "2", "40", true, "0", "0"],
  ["6", "1", "50", true, "0", "8"],
];

const FUEL_DEFAULT_EQUIP = {
  "1": "4",
  "2": "4",
  "3": "4",
  "4": "4",
  "5": "1",
  "6": "1",
  "7": "1",
  "8": "1",
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

async function showBoilerType1Panel(page) {
  await page.evaluate(() => {
    if (heatingType1ActiveId() !== "boiler") setHeatingType1System("boiler");
    else ensureHeatingBoilerDefaults();
    renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  await page.waitForSelector(`[data-xml-path="${BOILER_PATH}/Equipment/EnergySource"]`, { timeout: 30000 });
}

async function setUnitMode(page, mode) {
  await page.evaluate((m) => {
    const sel = document.querySelector("#unitMode");
    if (sel) {
      sel.value = m;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, mode);
}

async function gotoBoiler(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(
    () => typeof heatingBoilerSpecFor === "function" && typeof renderHeatingScreen === "function",
    { timeout: 90000 },
  );
  await showBoilerType1Panel(page);
}

async function readSpecs(page) {
  return page.evaluate(({ BOILER_PATH }) => {
    const steady = String(getPath(`${BOILER_PATH}/Specifications/@isSteadyState`) || "").toLowerCase() === "true";
    return {
      fuel: getPath(`${BOILER_PATH}/Equipment/EnergySource/@code`),
      equip: getPath(`${BOILER_PATH}/Equipment/EquipmentType/@code`),
      efficiency: getPath(`${BOILER_PATH}/Specifications/@efficiency`),
      steady,
      pilot: getPath(`${BOILER_PATH}/Specifications/@pilotLight`),
      flue: getPath(`${BOILER_PATH}/Specifications/@flueDiameter`),
    };
  }, { BOILER_PATH });
}

async function setFuelEquip(page, fuelCode, equipCode) {
  await page.evaluate(
    ({ BOILER_PATH, fuelCode, equipCode }) => {
      const fuelDict = BOILER_FUELS;
      const types = heatingBoilerEquipmentTypesDict(fuelCode);
      applyCodedDefault(`${BOILER_PATH}/Equipment/EnergySource`, fuelCode, fuelDict);
      applyCodedDefault(`${BOILER_PATH}/Equipment/EquipmentType`, equipCode, types);
      heatingBoilerApplyEquipmentSpecs(BOILER_PATH);
    },
    { BOILER_PATH, fuelCode, equipCode },
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
  await gotoBoiler(page, base);

  for (const [fuel, equip, eff, steady, pilot, flue] of SCREENSHOT_SPECS) {
    await setFuelEquip(page, fuel, equip);
    const s = await readSpecs(page);
    assert(s.fuel === fuel && s.equip === equip, `fuel/equip ${fuel}/${equip}`);
    assert(s.efficiency === eff, `${fuel}/${equip} efficiency ${eff}, got ${s.efficiency}`);
    assert(s.steady === steady, `${fuel}/${equip} steady ${steady}`);
    assert(s.pilot === pilot, `${fuel}/${equip} pilot ${pilot}, got ${s.pilot}`);
    assert(s.flue === flue, `${fuel}/${equip} flue ${flue}, got ${s.flue}`);
  }

  await page.evaluate(({ BOILER_PATH }) => {
    setPath(`${BOILER_PATH}/Specifications/@efficiency`, "66");
    setPath(`${BOILER_PATH}/Specifications/@pilotLight`, "123");
  }, { BOILER_PATH });
  await showBoilerType1Panel(page);
  let persisted = await readSpecs(page);
  assert(persisted.efficiency === "66" && persisted.pilot === "123", "saved values survive re-render");

  await setFuelEquip(page, "2", "4");
  await showBoilerType1Panel(page);
  const equipSel = `[data-xml-path="${BOILER_PATH}/Equipment/EquipmentType"]`;
  await page.select(equipSel, "1");
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, equipSel);
  const afterType = await readSpecs(page);
  assert(afterType.equip === "1" && afterType.efficiency === "77", "equipment type change applies specs");

  await page.evaluate(({ BOILER_PATH }) => {
    setPath(`${BOILER_PATH}/Specifications/@efficiency`, "55");
    renderHeatingScreen();
  }, { BOILER_PATH });
  await showBoilerType1Panel(page);
  persisted = await readSpecs(page);
  assert(persisted.efficiency === "55", "re-render alone does not reset edited efficiency");

  const fuelSel = `[data-xml-path="${BOILER_PATH}/Equipment/EnergySource"]`;
  await page.select(fuelSel, "4");
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, fuelSel);
  const propane = await readSpecs(page);
  assert(propane.fuel === "4" && propane.equip === "4", "propane default induced draft type");
  assert(propane.efficiency === "82", "propane induced draft 82% not gas 80%");

  for (const [fuel, expectedEquip] of Object.entries(FUEL_DEFAULT_EQUIP)) {
    await page.evaluate(
      ({ BOILER_PATH, fuel, expectedEquip }) => {
        applyCodedDefault(`${BOILER_PATH}/Equipment/EnergySource`, fuel, BOILER_FUELS);
        heatingBoilerApplyFuelDefaults(BOILER_PATH, { onEnergySourceChange: true });
      },
      { BOILER_PATH, fuel, expectedEquip },
    );
    const s = await readSpecs(page);
    assert(s.equip === expectedEquip, `fuel ${fuel} default equip ${expectedEquip}, got ${s.equip}`);
  }

  await page.evaluate(({ BOILER_PATH }) => {
    applyCodedDefault(`${BOILER_PATH}/Equipment/EnergySource`, "2", BOILER_FUELS);
    applyCodedDefault(`${BOILER_PATH}/Equipment/EquipmentType`, "1", BOILER_EQUIP_GAS);
    heatingBoilerApplyEquipmentSpecs(BOILER_PATH);
    renderHeatingScreen();
  }, { BOILER_PATH });
  await showBoilerType1Panel(page);

  const pilotImperial = await page.evaluate(({ BOILER_PATH }) => {
    const input = document.querySelector(`[data-xml-path="${BOILER_PATH}/Specifications/@pilotLight"]`);
    return input?.value;
  }, { BOILER_PATH });
  assert(pilotImperial === "999.2", "pilot display imperial");

  await setUnitMode(page, "metric");
  await showBoilerType1Panel(page);
  const pilotMetric = await page.evaluate(({ BOILER_PATH }) => {
    const stored = getPath(`${BOILER_PATH}/Specifications/@pilotLight`);
    const input = document.querySelector(`[data-xml-path="${BOILER_PATH}/Specifications/@pilotLight"]`);
    return { stored, display: input?.value, fromHelper: fromSI(stored, "heating-pilot-btu-hr") };
  }, { BOILER_PATH });
  assert(Number(pilotMetric.stored) === 999.2, "pilot canonical BTU/hr unchanged in metric");
  assert(
    Number(pilotMetric.display) === Number(pilotMetric.fromHelper) && Number(pilotMetric.display) !== 999.2,
    "pilot metric display from conversion helper",
  );

  await page.evaluate(({ BOILER_PATH }) => {
    setPath(`${BOILER_PATH}/Specifications/@flueDiameter`, "6");
    renderHeatingScreen();
  }, { BOILER_PATH });
  await showBoilerType1Panel(page);
  await setUnitMode(page, "metric");
  await showBoilerType1Panel(page);
  const flueMm = await page.evaluate(({ BOILER_PATH }) => {
    const input = document.querySelector(`[data-xml-path="${BOILER_PATH}/Specifications/@flueDiameter"]`);
    return input?.value;
  }, { BOILER_PATH });
  assert(flueMm === "152.4", "6 in displays as 152.4 mm");

  await browser.close();
  server.close();
  console.log("heating-boiler-equipment-spec-defaults-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
