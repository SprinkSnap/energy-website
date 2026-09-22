import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadOptionLabels(packId) {
  const pack = JSON.parse(readFileSync(join(root, "catalog/options", `${packId}.json`), "utf8"));
  return Object.values(pack.options).map((o) => o.en);
}

const faucetLabels = loadOptionLabels("bathroom-faucet-flow");
assert(
  faucetLabels.join("|") ===
    [
      "Ultra Low flow 3.8 L/min (1.0 US gpm)",
      "Low flow 5.7 L/min (1.5 US gpm)",
      "Standard 8.3 L/min (2.2 US gpm)",
    ].join("|"),
  "Faucet flow catalog order/labels",
);

const showerTempLabels = loadOptionLabels("shower-temperature");
assert(
  showerTempLabels.join("|") === "Cool 37°C (99°F)|Warm 41°C (106°F)|Hot 45°C (113°F)",
  "Shower temperature catalog",
);

const showerFlowLabels = loadOptionLabels("shower-flow-rate");
assert(
  showerFlowLabels.join("|") ===
    [
      "Ultra Low flow 5.7 L/min (1.5 US gpm)",
      "Low flow 7.6 L/min (2.0 US gpm)",
      "Standard 9.5 L/min (2.5 US gpm)",
      "Older 15 L/min (4.0 US gpm)",
      "High Flow 19 L/min (5.0 US gpm)",
    ].join("|"),
  "Shower flow catalog",
);

const washerRatedLabels = loadOptionLabels("washer-rated-values");
assert(washerRatedLabels.join("|") === "Default|High Efficiency|User Specified", "Washer rated catalog");

const washerTempLabels = loadOptionLabels("washer-temperature");
assert(washerTempLabels.join("|") === "Hot|Cold", "Washer temperature catalog");

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

function optionTexts(select) {
  return [...(select?.options ?? [])].map((o) => o.textContent.trim());
}

const puppeteerPaths = [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
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

  const paths = {
    faucetFlow: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/BathroomFaucets"]',
    showerTemp: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/Shower/Temperature"]',
    showerFlow: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/Shower/FlowRate"]',
    washerRated: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/ClothesWasher/RatedValues"]',
    washerTemp: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/ClothesWasher/Temperature"]',
    dishRated: '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/DishWasher/RatedValues"]',
  };

  await page.goto(`${base}/index.html`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.evaluate(() => document.getElementById("newBtn")?.click());
  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector(paths.faucetFlow, { timeout: 120000 });

  const ui = await page.evaluate((p) => {
    const selected = (sel) => sel?.options?.[sel.selectedIndex]?.textContent?.trim() ?? "";
    const labels = (sel) => [...(sel?.options ?? [])].map((o) => o.textContent.trim());
    return {
      faucetLabels: labels(document.querySelector(p.faucetFlow)),
      faucetSelected: selected(document.querySelector(p.faucetFlow)),
      showerTempLabels: labels(document.querySelector(p.showerTemp)),
      showerTempSelected: selected(document.querySelector(p.showerTemp)),
      showerFlowLabels: labels(document.querySelector(p.showerFlow)),
      showerFlowSelected: selected(document.querySelector(p.showerFlow)),
      washerRatedLabels: labels(document.querySelector(p.washerRated)),
      washerRatedSelected: selected(document.querySelector(p.washerRated)),
      washerTempLabels: labels(document.querySelector(p.washerTemp)),
      washerTempSelected: selected(document.querySelector(p.washerTemp)),
      dishRatedLabels: labels(document.querySelector(p.dishRated)),
      dishRatedSelected: selected(document.querySelector(p.dishRated)),
    };
  }, paths);

  assert(ui.faucetLabels.length === 3, `Faucet flow option count ${ui.faucetLabels.length}`);
  assert(ui.faucetLabels.join("|") === faucetLabels.join("|"), "Faucet flow UI labels/order");
  assert(ui.faucetSelected === "Standard 8.3 L/min (2.2 US gpm)", `Faucet default ${ui.faucetSelected}`);

  assert(ui.showerTempLabels.join("|") === showerTempLabels.join("|"), "Shower temp UI labels");
  assert(ui.showerTempSelected === "Warm 41°C (106°F)", `Shower temp default ${ui.showerTempSelected}`);

  assert(ui.showerFlowLabels.join("|") === showerFlowLabels.join("|"), "Shower flow UI labels");
  assert(ui.showerFlowSelected === "Standard 9.5 L/min (2.5 US gpm)", `Shower flow default ${ui.showerFlowSelected}`);

  assert(ui.washerRatedLabels.join("|") === washerRatedLabels.join("|"), "Washer rated UI labels");
  assert(ui.washerRatedSelected === "Default", `Washer rated default ${ui.washerRatedSelected}`);

  assert(ui.washerTempLabels.join("|") === washerTempLabels.join("|"), "Washer temp UI labels");
  assert(ui.washerTempSelected === "Hot", `Washer temp default ${ui.washerTempSelected}`);

  assert(ui.dishRatedLabels.join("|") === washerRatedLabels.join("|"), "Dish rated UI labels");
  assert(ui.dishRatedSelected === "Default", `Dish rated default ${ui.dishRatedSelected}`);

  await page.select(paths.showerTemp, "2");
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.options?.[document.querySelector(sel).selectedIndex]?.textContent?.trim() === "Hot 45°C (113°F)",
    { timeout: 12000 },
    paths.showerTemp,
  );

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("[data-base-loads-restore]", { timeout: 120000 });
  await page.evaluate(() => document.querySelector("[data-base-loads-restore]")?.click());
  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.options?.[document.querySelector(sel).selectedIndex]?.textContent?.trim() === "Warm 41°C (106°F)",
    { timeout: 30000 },
    paths.showerTemp,
  );

  await browser.close();
  server.close();
  console.log("base-loads-water-dropdown-options-check: all tests passed");
} else {
  console.log("base-loads-water-dropdown-options-check: catalog assertions passed (puppeteer unavailable)");
}
