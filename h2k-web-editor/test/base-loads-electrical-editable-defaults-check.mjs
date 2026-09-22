import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function restoreElectricalUsageDefaults"), "restoreElectricalUsageDefaults must exist");
assert(appJs.includes("function applyElectricalUsageDefaultsForNewFile"), "applyElectricalUsageDefaultsForNewFile must exist");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".h2k": "application/xml",
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
      const ext = filePath.slice(filePath.lastIndexOf("."));
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function gotoElectrical(page, base) {
  await page.goto(`${base}/index.html#/systems/base-loads/electrical-usage`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-base-loads-electrical .base-loads-electrical-section", {
    timeout: 120000,
  });
}

function selectedOptionText(select) {
  if (!select) return "";
  return select.options?.[select.selectedIndex]?.textContent?.trim() ?? "";
}

function optionTexts(select) {
  if (!select) return [];
  return [...select.options].map((o) => o.textContent?.trim() ?? "");
}

const paths = {
  dryerInstalled: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/@installed"]',
  dryerFuel: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/EnergySource"]',
  dryerRated: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/RatedValue"]',
  dryerPct: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/@percentageOfWasherLoads"]',
  dryerEnergy: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/RatedValue/@value"]',
  dryerLocation: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/ClothesDryer/Location"]',
  stoveFuel: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/Stove/EnergySource"]',
  stoveRated: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/Stove/RatedValue"]',
  stoveEnergy: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/Stove/RatedValue/@value"]',
  fridgeRated: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/Refrigerator"]',
  fridgeEnergy: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/Refrigerator/@value"]',
  lightingCat: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/InteriorLighting"]',
  lightingVal: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/InteriorLighting/@value"]',
  otherLoad: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/@otherLoad"]',
  exterior: '[data-xml-path="/HouseFile/House/BaseLoads/ElectricalUsage/@averageExteriorUse"]',
};

const enableSelectors = Object.values(paths);

const puppeteerPaths = [
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
  join(root, "node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js"),
];
let puppeteer;
for (const p of puppeteerPaths) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}

if (puppeteer) {
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
  await page.evaluate(() => document.getElementById("newBtn")?.click());
  await gotoElectrical(page, base);

  const defaults = await page.evaluate((p) => {
    const root = document.querySelector("#screen-systems-base-loads-electrical");
    const q = (sel) => root?.querySelector(sel);
    const selText = (sel) => q(sel)?.options?.[q(sel).selectedIndex]?.textContent?.trim() ?? "";
    const opts = (sel) => [...(q(sel)?.options ?? [])].map((o) => o.textContent?.trim() ?? "");
    return {
      dryerInstalled: q(p.dryerInstalled)?.checked,
      dryerFuelOpts: opts(p.dryerFuel),
      dryerFuel: selText(p.dryerFuel),
      dryerRatedOpts: opts(p.dryerRated),
      dryerRated: selText(p.dryerRated),
      dryerPct: q(p.dryerPct)?.value,
      dryerEnergy: q(p.dryerEnergy)?.value,
      dryerLocationOpts: opts(p.dryerLocation),
      dryerLocation: selText(p.dryerLocation),
      stoveFuelOpts: opts(p.stoveFuel),
      stoveFuel: selText(p.stoveFuel),
      stoveRatedOpts: opts(p.stoveRated),
      stoveRated: selText(p.stoveRated),
      stoveEnergy: q(p.stoveEnergy)?.value,
      fridgeRatedOpts: opts(p.fridgeRated),
      fridgeRated: selText(p.fridgeRated),
      fridgeEnergy: q(p.fridgeEnergy)?.value,
      lightingOpts: opts(p.lightingCat),
      lightingCat: selText(p.lightingCat),
      lightingVal: q(p.lightingVal)?.value,
      otherLoad: q(p.otherLoad)?.value,
      exterior: q(p.exterior)?.value,
    };
  }, paths);

  assert(defaults.dryerInstalled === true, "Dryer installed checked");
  assert(defaults.dryerFuelOpts.join("|") === "Electric|Natural Gas|Propane", `Dryer fuel options ${defaults.dryerFuelOpts}`);
  assert(defaults.dryerFuel === "Electric", `Dryer fuel Electric, got ${defaults.dryerFuel}`);
  assert(defaults.dryerRatedOpts.join("|") === "Default|User Specified", "Dryer rated options");
  assert(defaults.dryerRated === "Default", `Dryer rated Default, got ${defaults.dryerRated}`);
  assert(Number(defaults.dryerPct) === 71.4, `Dryer pct 71.4, got ${defaults.dryerPct}`);
  assert(Number(defaults.dryerEnergy) === 916, `Dryer energy 916, got ${defaults.dryerEnergy}`);
  assert(defaults.dryerLocationOpts.join("|") === "Main Floor", `Dryer location options ${defaults.dryerLocationOpts}`);
  assert(defaults.dryerLocation === "Main Floor", `Dryer location Main Floor, got ${defaults.dryerLocation}`);
  assert(defaults.stoveFuel === "Natural Gas", `Stove fuel Natural Gas, got ${defaults.stoveFuel}`);
  assert(defaults.stoveRated === "Default", `Stove rated Default, got ${defaults.stoveRated}`);
  assert(Number(defaults.stoveEnergy) === 565, `Stove energy 565, got ${defaults.stoveEnergy}`);
  assert(defaults.fridgeRated === "Default", `Fridge rated Default, got ${defaults.fridgeRated}`);
  assert(Number(defaults.fridgeEnergy) === 639, `Fridge energy 639, got ${defaults.fridgeEnergy}`);
  assert(
    defaults.lightingOpts.join("|") === "< 25% CFL or LED|25%-75% CFL or LED|>75% CFL or LED|User Specified",
    "Lighting options",
  );
  assert(defaults.lightingCat === "< 25% CFL or LED", `Lighting default category, got ${defaults.lightingCat}`);
  assert(Number(defaults.lightingVal) === 2.6, `Lighting value 2.6, got ${defaults.lightingVal}`);
  assert(defaults.otherLoad === "9.70", `Other load 9.70, got ${defaults.otherLoad}`);
  assert(Number(defaults.exterior) === 0.9, `Exterior 0.9, got ${defaults.exterior}`);

  const enabled = await page.evaluate((sels) => {
    const root = document.querySelector("#screen-systems-base-loads-electrical");
    return sels.map((sel) => {
      const el = root?.querySelector(sel);
      return { sel, disabled: el?.disabled ?? true, readOnly: el?.readOnly ?? false };
    });
  }, enableSelectors);
  for (const row of enabled) {
    assert(!row.disabled, `Field must be enabled: ${row.sel}`);
  }

  await page.evaluate((p) => {
    const root = document.querySelector("#screen-systems-base-loads-electrical");
    const q = (sel) => root?.querySelector(sel);
    const rated = q(p.dryerRated);
    const energy = q(p.dryerEnergy);
    if (rated?.options?.length > 1) {
      rated.selectedIndex = 0;
      rated.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { energyDisabled: energy?.disabled };
  }, paths);
  const afterDefault = await page.evaluate((p) => {
    const root = document.querySelector("#screen-systems-base-loads-electrical");
    const q = (sel) => root?.querySelector(sel);
    return {
      energyDisabled: q(p.dryerEnergy)?.disabled,
      energy: q(p.dryerEnergy)?.value,
    };
  }, paths);
  assert(!afterDefault.energyDisabled, "Dryer energy must stay enabled when Rated values is Default");
  assert(Number(afterDefault.energy) === 916, "Dryer energy unchanged when Default selected");

  await page.evaluate((p) => {
    const root = document.querySelector("#screen-systems-base-loads-electrical");
    const field = root?.querySelector(p.lightingVal);
    field.value = "3.3";
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, paths);
  await page.reload({ waitUntil: "networkidle2" });
  await gotoElectrical(page, base);
  const afterReload = await page.evaluate((p) => {
    const root = document.querySelector("#screen-systems-base-loads-electrical");
    return root?.querySelector(p.lightingVal)?.value ?? "";
  }, paths);
  assert(Number(afterReload) === 3.3, `Edited lighting value must persist reload, got ${afterReload}`);

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.click("[data-base-loads-restore]");
  await gotoElectrical(page, base);
  const afterRestore = await page.evaluate((p) => {
    const root = document.querySelector("#screen-systems-base-loads-electrical");
    const q = (sel) => root?.querySelector(sel);
    const selText = (sel) => q(sel)?.options?.[q(sel).selectedIndex]?.textContent?.trim() ?? "";
    return {
      stoveFuel: selText(p.stoveFuel),
      lightingVal: q(p.lightingVal)?.value,
      otherLoad: q(p.otherLoad)?.value,
    };
  }, paths);
  assert(afterRestore.stoveFuel === "Natural Gas", "Restore Defaults stove fuel");
  assert(Number(afterRestore.lightingVal) === 2.6, "Restore Defaults lighting value");
  assert(afterRestore.otherLoad === "9.70", "Restore Defaults other load");

  await browser.close();
  server.close();
  console.log("base-loads-electrical-editable-defaults-check: all tests passed");
} else {
  console.log("base-loads-electrical-editable-defaults-check: static assertions passed (puppeteer unavailable)");
}
