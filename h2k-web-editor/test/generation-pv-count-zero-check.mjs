/**
 * Photovoltaic Systems count minimum 0 — navigation, validation, stash restore.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("const GENERATION_PV_MIN = 0"), "GENERATION_PV_MIN is 0");
assert(appJs.includes("GENERATION_PV_NEW_FILE_DEFAULT = 1"), "new-house default remains 1 system");

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

async function setPvCount(page, value) {
  await page.evaluate((v) => {
    const input = document.querySelector("#screen-systems-generation-main [data-generation-pv-count]");
    if (!input) throw new Error("missing PV count input");
    input.value = String(v);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function readState(page) {
  return page.evaluate(() => {
    const navLinks = [...(document.querySelector(".generation-local-nav")?.querySelectorAll("a") || [])].map(
      (a) => a.textContent.trim(),
    );
    const hostHidden = document.querySelector("[data-generation-local-nav-host]")?.hidden === true;
    const mainActive = document.querySelector("#screen-systems-generation-main")?.classList.contains("active");
    const pvActive = document.querySelector("#screen-systems-generation-pv")?.classList.contains("active");
    const count = Number(document.querySelector("[data-generation-pv-count]")?.value || 0);
    const battery = document.querySelector('#screen-systems-generation-main [data-xml-path$="/@batteryStorage"]');
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return {
      navLinks,
      hostHidden,
      mainActive,
      pvActive,
      count,
      hasBattery: !!battery,
      overflow,
      pvFormOnMain: !!document.querySelector("#screen-systems-generation-main .generation-pv-form"),
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
  if (!puppeteer) {
    console.log("generation-pv-count-zero-check.mjs: static assertions passed (puppeteer unavailable)");
    return;
  }

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-generation-main.active [data-generation-pv-count]", { timeout: 90000 });

  await setPvCount(page, 2);
  await page.waitForFunction(
    () => document.querySelectorAll(".generation-local-nav a").length >= 3,
    { timeout: 90000 },
  );

  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-2`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv.active", { timeout: 90000 });
  await page.evaluate(() => {
    setPath("/HouseFile/House/Generation/PhotovoltaicSystems/System[2]/@capacity", "2.222");
    if (typeof saveSession === "function") saveSession();
  });

  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await setPvCount(page, 0);
  await page.waitForFunction(
    () =>
      Number(document.querySelector("[data-generation-pv-count]")?.value) === 0 &&
      document.querySelector("[data-generation-local-nav-host]")?.hidden === true,
    { timeout: 90000 },
  );

  let state = await readState(page);
  assert(state.count === 0, "count 0 accepted");
  assert(state.hostHidden, "local nav hidden when count is 0");
  assert(!state.navLinks.some((t) => t.includes("Photovoltaic System")), "no PV nav items at count 0");
  assert(state.mainActive, "main generation screen active after drop to 0");
  assert(!state.pvActive, "PV screen not active at count 0");
  assert(!state.pvFormOnMain, "no PV form on main at count 0");
  assert(state.hasBattery, "battery control still on main at count 0");

  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-main.active", { timeout: 90000 });
  state = await readState(page);
  assert(state.mainActive && !state.pvActive, "PV URL redirects to main when count is 0");

  await setPvCount(page, 1);
  await page.waitForFunction(
    () => document.querySelectorAll(".generation-local-nav a").length >= 2,
    { timeout: 90000 },
  );
  state = await readState(page);
  assert(state.count === 1, "count 1 accepted");
  assert(!state.hostHidden, "local nav visible when count is 1");
  assert(state.navLinks.includes("Photovoltaic System 1"), "PV System 1 nav shown");

  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForSelector("#screen-systems-generation-pv.active", { timeout: 90000 });

  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await setPvCount(page, 0);
  await page.waitForFunction(
    () => document.querySelector("#screen-systems-generation-main.active"),
    { timeout: 90000 },
  );
  state = await readState(page);
  assert(state.mainActive && !state.pvActive, "1 → 0 hides PV panel again");

  await setPvCount(page, 2);
  await page.waitForFunction(
    () => document.querySelectorAll(".generation-local-nav a").length >= 3,
    { timeout: 90000 },
  );
  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-2`, {
    waitUntil: "networkidle2",
    timeout: 120000,
  });
  await page.waitForFunction(
    () => getPath("/HouseFile/House/Generation/PhotovoltaicSystems/System[2]/@capacity") === "2.222",
    { timeout: 90000 },
  );

  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await setPvCount(page, 8);
  await page.waitForFunction(
    () => document.querySelectorAll(".generation-local-nav a").length >= 9,
    { timeout: 90000 },
  );
  state = await readState(page);
  assert(state.count === 8, "count 8 accepted");
  assert(state.navLinks.includes("Photovoltaic System 8"), "all eight PV nav entries");

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 150));
    const responsive = await readState(page);
    assert(!responsive.overflow, `no horizontal overflow at ${width}px`);
    assert(responsive.hasBattery, `battery visible at ${width}px`);
  }

  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await setPvCount(page, -3);
  state = await readState(page);
  assert(state.count === 0, "negative clamped to 0");

  await setPvCount(page, 12);
  state = await readState(page);
  assert(state.count === 8, "values above 8 clamped to 8");

  await browser.close();
  server.close();
  console.log("generation-pv-count-zero-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
