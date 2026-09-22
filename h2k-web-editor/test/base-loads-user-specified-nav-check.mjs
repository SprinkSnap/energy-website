import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("function baseLoadsNavItems"), "baseLoadsNavItems filters Base Loads tabs");
assert(appJs.includes("baseLoadsUserSpecified()") && appJs.includes("filter(item=>!item.id)"), "User Specified hides detail tabs from nav data");

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

async function navSnapshot(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      const r = el?.getBoundingClientRect();
      return Boolean(r && r.width > 0 && r.height > 0);
    };
    const localNav = document.querySelector(".base-loads-local-nav");
    const items = [...(localNav?.querySelectorAll(".base-loads-local-nav-item") || [])].filter(isVisible);
    const labels = items.map((el) => el.textContent.trim());
    return {
      labels,
      advancedHidden: document.querySelector("[data-base-loads-advanced]")?.hasAttribute("hidden") === true,
      restoreDisabled: document.querySelector("[data-base-loads-restore]")?.disabled === true,
      hash: location.hash,
      activeScreen: document.querySelector("#view-systems .screen.active")?.id || "",
    };
  });
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
  const userSpecPath = '[data-xml-path="/HouseFile/House/BaseLoads/@userSpecifiedUsage"]';
  const markerPath = '[data-xml-path="/HouseFile/House/BaseLoads/WaterUsage/BathroomFaucets/@numberPerOccupantPerDay"]';

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector(".base-loads-local-nav", { timeout: 120000 });

  let snap = await navSnapshot(page);
  assert(snap.labels.includes("Water Usage"), "Water Usage tab visible when User Specified unchecked");
  assert(snap.labels.includes("Electrical Usage"), "Electrical Usage tab visible when User Specified unchecked");
  assert(snap.advancedHidden === true, "Advanced section hidden when User Specified unchecked");
  assert(snap.restoreDisabled === false, "Restore Defaults enabled when unchecked");

  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-base-loads-water.active", { timeout: 120000 });
  await page.waitForSelector(markerPath, { timeout: 120000 });
  const markerValue = "9.87";
  await page.evaluate(
    (sel, value) => {
      const field = document.querySelector(sel);
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    },
    markerPath,
    markerValue,
  );

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector(userSpecPath, { timeout: 120000 });
  await page.click(userSpecPath);
  await page.waitForFunction(
    () => !document.querySelector("[data-base-loads-advanced]")?.hasAttribute("hidden"),
    { timeout: 12000 },
  );

  snap = await navSnapshot(page);
  assert(!snap.labels.includes("Water Usage"), "Water Usage tab hidden when User Specified checked");
  assert(!snap.labels.includes("Electrical Usage"), "Electrical Usage tab hidden when User Specified checked");
  assert(snap.labels.includes("Base Loads"), "Base Loads tab remains when User Specified checked");
  assert(snap.advancedHidden === false, "Advanced section visible when User Specified checked");
  assert(snap.restoreDisabled === false, "Restore Defaults enabled when checked");
  assert(snap.hash.includes("#/systems/base-loads") && !snap.hash.includes("water-usage"), "checking User Specified from summary keeps summary route");
  assert(snap.activeScreen === "screen-systems-base-loads", "active screen is Base Loads summary when tabs hidden");

  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => location.hash === "#/systems/base-loads" || location.hash === "#/systems/base-loads/",
    { timeout: 12000 },
  );
  snap = await navSnapshot(page);
  assert(!snap.labels.includes("Water Usage"), "direct water route redirects while User Specified checked");

  await page.click(userSpecPath);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.checked === false,
    { timeout: 12000 },
    userSpecPath,
  );
  snap = await navSnapshot(page);
  assert(snap.labels.includes("Water Usage"), "Water Usage tab returns when User Specified unchecked");
  assert(snap.labels.includes("Electrical Usage"), "Electrical Usage tab returns when User Specified unchecked");
  assert(snap.advancedHidden === true, "Advanced hidden again when User Specified unchecked");

  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector(markerPath, { timeout: 120000 });
  const restoredMarker = await page.$eval(markerPath, (el) => el.value);
  assert(restoredMarker === markerValue, `Water Usage data preserved across User Specified toggle, got ${restoredMarker}`);

  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-base-loads-water.active", { timeout: 120000 });
  await page.evaluate((sel) => {
    const cb = document.querySelector(sel);
    if (!cb) throw new Error("User Specified checkbox missing from Base Loads DOM");
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  }, userSpecPath);
  await page.waitForFunction(
    () => location.hash.includes("#/systems/base-loads") && !location.hash.includes("water-usage"),
    { timeout: 12000 },
  );
  snap = await navSnapshot(page);
  assert(snap.activeScreen === "screen-systems-base-loads", "checking User Specified on Water Usage redirects to summary");

  await page.evaluate((sel) => {
    const cb = document.querySelector(sel);
    cb.checked = false;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  }, userSpecPath);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.checked === false,
    { timeout: 12000 },
    userSpecPath,
  );

  await page.goto(`${base}/index.html#/systems/base-loads/electrical-usage`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-base-loads-electrical.active", { timeout: 120000 });
  await page.evaluate((sel) => {
    const cb = document.querySelector(sel);
    if (!cb) throw new Error("User Specified checkbox missing from Base Loads DOM");
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  }, userSpecPath);
  await page.waitForFunction(
    () => location.hash.includes("#/systems/base-loads") && !location.hash.includes("electrical-usage"),
    { timeout: 12000 },
  );
  snap = await navSnapshot(page);
  assert(snap.activeScreen === "screen-systems-base-loads", "checking User Specified on Electrical Usage redirects to summary");

  for (const width of [375, 430, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 120));
    snap = await navSnapshot(page);
    assert(!snap.labels.includes("Water Usage"), `Water Usage hidden at ${width}px`);
    assert(!snap.labels.includes("Electrical Usage"), `Electrical Usage hidden at ${width}px`);
    assert(snap.restoreDisabled === false, `Restore enabled at ${width}px`);
  }

  await browser.close();
  server.close();
} else {
  console.warn("base-loads-user-specified-nav-check.mjs: skipped browser checks (puppeteer-core unavailable)");
}

console.log("base-loads-user-specified-nav-check.mjs: all assertions passed");
