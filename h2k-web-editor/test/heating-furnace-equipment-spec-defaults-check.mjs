/**
 * Furnace equipment-specific HOT2000 defaults by energy source + equipment type.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const FURNACE_PATH = "/HouseFile/House/HeatingCooling/Type1/Furnace";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("const FURNACE_EQUIP_SPECS"), "FURNACE_EQUIP_SPECS map");
assert(appJs.includes("function heatingFurnaceApplyEquipmentSpecs"), "apply furnace equipment specs");

/** [fuelCode, equipCode, efficiency, steadyState, pilot, flue] */
const SCREENSHOT_SPECS = [
  ["1", "2", "100", true, "0", "0"],
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
  ["5", "1", "70", true, "0", "5"],
  ["5", "2", "75", true, "0", "4"],
  ["5", "3", "50", true, "0", "8"],
  ["5", "4", "60", true, "0", "5"],
  ["5", "6", "75", true, "0", "5"],
  ["5", "5", "70", true, "0", "5"],
  ["5", "8", "35", true, "0", "5"],
  ["5", "7", "60", true, "0", "5"],
  ["6", "3", "50", true, "0", "8"],
  ["7", "3", "50", true, "0", "8"],
  ["7", "8", "35", true, "0", "5"],
  ["8", "3", "50", true, "0", "8"],
  ["8", "8", "35", true, "0", "5"],
];

const FUEL_DEFAULT_EQUIP = {
  "1": "2",
  "2": "4",
  "3": "4",
  "4": "4",
  "5": "1",
  "6": "1",
  "7": "1",
  "8": "1",
};

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

async function showFurnacePanel(page) {
  await page.evaluate(() => {
    if (heatingType1ActiveId() !== "furnace") setHeatingType1System("furnace");
    else ensureHeatingFurnaceDefaults();
    renderHeatingScreen();
    document.querySelector('[data-heating-tab="type1"]')?.click();
  });
  await page.waitForSelector(`[data-xml-path="${FURNACE_PATH}/Equipment/EnergySource"]`, { timeout: 30000 });
}

async function gotoFurnace(page, base) {
  await page.goto(`${base}/index.html#/systems/heating-cooling`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(
    () => typeof heatingFurnaceSpecFor === "function" && typeof renderHeatingScreen === "function",
    { timeout: 90000 },
  );
  await showFurnacePanel(page);
}

async function readSpecs(page) {
  return page.evaluate(({ FURNACE_PATH }) => {
    const steady =
      String(getPath(`${FURNACE_PATH}/Specifications/@isSteadyState`) || "").toLowerCase() === "true";
    return {
      fuel: getPath(`${FURNACE_PATH}/Equipment/EnergySource/@code`),
      equip: getPath(`${FURNACE_PATH}/Equipment/EquipmentType/@code`),
      efficiency: getPath(`${FURNACE_PATH}/Specifications/@efficiency`),
      steady,
      pilot: getPath(`${FURNACE_PATH}/Specifications/@pilotLight`),
      flue: getPath(`${FURNACE_PATH}/Specifications/@flueDiameter`),
    };
  }, { FURNACE_PATH });
}

async function setFuelEquip(page, fuelCode, equipCode) {
  await page.evaluate(
    ({ FURNACE_PATH, fuelCode, equipCode }) => {
      applyCodedDefault(`${FURNACE_PATH}/Equipment/EnergySource`, fuelCode, FURNACE_FUELS);
      applyCodedDefault(
        `${FURNACE_PATH}/Equipment/EquipmentType`,
        equipCode,
        heatingFurnaceEquipmentTypesDict(fuelCode),
      );
      heatingFurnaceApplyEquipmentSpecs(FURNACE_PATH);
    },
    { FURNACE_PATH, fuelCode, equipCode },
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
  await gotoFurnace(page, base);

  for (const [fuel, equip, eff, steady, pilot, flue] of SCREENSHOT_SPECS) {
    await setFuelEquip(page, fuel, equip);
    const s = await readSpecs(page);
    assert(s.fuel === fuel && s.equip === equip, `fuel/equip ${fuel}/${equip}`);
    assert(s.efficiency === eff, `${fuel}/${equip} efficiency ${eff}, got ${s.efficiency}`);
    assert(s.steady === steady, `${fuel}/${equip} steady ${steady}`);
    assert(s.pilot === pilot, `${fuel}/${equip} pilot ${pilot}, got ${s.pilot}`);
    assert(s.flue === flue, `${fuel}/${equip} flue ${flue}, got ${s.flue}`);
  }

  await setFuelEquip(page, "2", "4");
  await showFurnacePanel(page);
  const equipSel = `[data-xml-path="${FURNACE_PATH}/Equipment/EquipmentType"]`;
  await page.select(equipSel, "1");
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, equipSel);
  const afterType = await readSpecs(page);
  assert(afterType.equip === "1" && afterType.efficiency === "77", "equipment type change applies specs");

  await page.evaluate(({ FURNACE_PATH }) => {
    setPath(`${FURNACE_PATH}/Specifications/@efficiency`, "55");
    renderHeatingScreen();
  }, { FURNACE_PATH });
  await showFurnacePanel(page);
  const persisted = await readSpecs(page);
  assert(persisted.efficiency === "55", "re-render does not reset edited efficiency");

  const fuelSel = `[data-xml-path="${FURNACE_PATH}/Equipment/EnergySource"]`;
  await page.select(fuelSel, "4");
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, fuelSel);
  const propane = await readSpecs(page);
  assert(propane.fuel === "4" && propane.equip === "4" && propane.efficiency === "82", "propane fuel change");

  for (const [fuel, expectedEquip] of Object.entries(FUEL_DEFAULT_EQUIP)) {
    await page.evaluate(
      ({ FURNACE_PATH, fuel }) => {
        applyCodedDefault(`${FURNACE_PATH}/Equipment/EnergySource`, fuel, FURNACE_FUELS);
        heatingFurnaceApplyFuelDefaults(FURNACE_PATH, { onEnergySourceChange: true });
      },
      { FURNACE_PATH, fuel },
    );
    const s = await readSpecs(page);
    assert(s.equip === expectedEquip, `fuel ${fuel} default equip ${expectedEquip}`);
  }

  await browser.close();
  server.close();
  console.log("heating-furnace-equipment-spec-defaults-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
