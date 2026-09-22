/**
 * Generation main summary — compact layout, grouping, responsive overflow.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
const WIDTHS = [375, 430, 768, 1024, 1440];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("generation-main-summary-grid"), "photovoltaic summary grid class");
assert(appJs.includes("generation-main-other-grid"), "other generation grid class");
assert(appJs.includes('generationWindRowHTML({compact:true})'), "compact wind row on main screen");
assert(stylesCss.includes(".generation-main-wind-row"), "compact wind row CSS");

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
    console.log("generation-main-compact-check.mjs: static assertions passed (puppeteer unavailable)");
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
  await page.evaluate(() => {
    if (typeof newEmptyModel === "function") newEmptyModel();
  });
  await page.waitForSelector("#screen-systems-generation-main.active .generation-main-summary-grid", {
    timeout: 90000,
  });

  const results = {};
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 150));
    const metrics = await page.evaluate(() => {
      const section = document.querySelector("#screen-systems-generation-main .generation-section");
      const doc = document.documentElement;
      const stepper = section?.querySelector(".generation-main-pv-stepper");
      const windRow = section?.querySelector(".generation-main-wind-row");
      const windStyle = windRow ? getComputedStyle(windRow) : null;
      const headings = [...(section?.querySelectorAll(".spec-group > h4") || [])].map((h) => h.textContent.trim());
      const capacity = section?.querySelector(".generation-main-capacity-field input");
      const pvCount = Number(document.querySelector("[data-generation-pv-count]")?.value || 0);
      const toggle = section?.querySelector("[data-wind-toggle]");
      const windVal = section?.querySelector(".generation-main-wind-row .wind-energy-value input");
      return {
        overflow: doc.scrollWidth > doc.clientWidth + 1,
        stepperWidth: stepper?.getBoundingClientRect().width || 0,
        viewportWidth: doc.clientWidth,
        windBorderWidth: windStyle?.borderTopWidth || "",
        windHasCardBorder: windStyle ? windStyle.borderTopWidth !== "0px" && windStyle.borderTopStyle !== "none" : false,
        headings,
        hasCount: !!section?.querySelector("[data-generation-pv-count]"),
        capacityDisabled: capacity?.disabled === true,
        count: pvCount,
        windValDisabledWhenOff: toggle?.checked ? true : windVal?.disabled === true,
        tappableStepper: (section?.querySelector(".numeric-stepper-btn")?.getBoundingClientRect().height || 0) >= 39,
      };
    });
    const pass =
      !metrics.overflow &&
      metrics.headings.includes("Photovoltaic") &&
      metrics.headings.includes("Other Generation") &&
      metrics.hasCount &&
      metrics.capacityDisabled === (metrics.count === 0) &&
      metrics.windValDisabledWhenOff &&
      metrics.tappableStepper &&
      !metrics.windHasCardBorder &&
      metrics.stepperWidth <= Math.min(metrics.viewportWidth * 0.55, 220);
    results[width] = { pass, ...metrics };
  }

  await browser.close();
  server.close();
  console.log(JSON.stringify({ results }, null, 2));
  if (!WIDTHS.every((w) => results[w].pass)) process.exit(1);
  console.log("generation-main-compact-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
