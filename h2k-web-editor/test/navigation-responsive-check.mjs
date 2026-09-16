/**
 * Headless responsiveness check for primary and section navigation.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [375, 430, 768, 1024, 1440];

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
  if (!puppeteer) throw new Error("Install puppeteer-core to run responsive checks");

  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const results = {};
  let horizontalOverflow = false;

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.goto(`${base}/index.html#/house/general`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector(".step-nav .nav", { timeout: 90000 });

    const metrics = await page.evaluate((viewportWidth) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const stepNav = document.querySelector(".step-nav");
      const stepNavStyle = stepNav ? getComputedStyle(stepNav) : null;
      const primaryNav = [...document.querySelectorAll(".step-nav .nav")].filter(isVisible);
      const primaryOverflow = primaryNav.some((el) => {
        const r = el.getBoundingClientRect();
        return r.right > doc.clientWidth + 2;
      });
      const primaryTappable = primaryNav.every((el) => el.getBoundingClientRect().height >= 40);
      const primaryHorizontal = stepNavStyle
        ? stepNavStyle.display === "grid" || stepNavStyle.flexDirection === "row"
        : true;
      const bottomNav = viewportWidth < 768 && stepNavStyle?.position === "fixed"
        && Number.parseFloat(stepNavStyle.bottom || "0") >= 0;
      const selectorBar = document.querySelector('[data-section-selector-bar="house"]');
      const selector = document.querySelector('[data-section-select="house"]');
      const sidebar = document.querySelector('[data-section-nav="house"] .section-nav-sidebar');
      const selectorBarVisible = selectorBar && isVisible(selectorBar);
      const sidebarVisible = sidebar && isVisible(sidebar);
      const selectorStyle = selectorBar ? getComputedStyle(selectorBar) : null;
      const selectorSticky = selectorStyle?.position === "sticky";
      const selectorNotFixed = selectorStyle?.position !== "fixed";
      const selectorTappable = selector ? selector.getBoundingClientRect().height >= 40 : false;
      const selectorValue = selector?.value;
      const pillCount = [...document.querySelectorAll('[data-section-nav="house"] .subnav-links a')].filter(isVisible).length;
      const stepper = document.querySelector('[data-section-stepper="house"]');
      const stepperVisible = stepper && isVisible(stepper);
      const stepperBtns = [...(stepper?.querySelectorAll("button") || [])].filter((el) => isVisible(el) && !el.hidden);
      const stepperTappable = stepperBtns.every((el) => el.getBoundingClientRect().height >= 40);
      const prevHidden = stepper?.querySelector('[data-section-stepper-prev="house"]')?.hidden;
      const programToolbar = document.querySelector(".program-toggle span");
      const programModeLabel = programToolbar?.textContent?.trim() || "";
      const activePrimary = document.querySelector('.step-nav .nav[aria-current="page"]');
      const shell = document.querySelector(".shell");
      const shellMax = shell ? getComputedStyle(shell).maxWidth : "";
      const sectionOk = viewportWidth < 960
        ? selectorBarVisible && selectorSticky && selectorNotFixed && !sidebarVisible && pillCount === 0 && selectorValue === "general" && selectorTappable
        : !selectorBarVisible && sidebarVisible && pillCount >= 8;
      const primaryOk = viewportWidth < 768
        ? bottomNav && primaryNav.length === 4
        : primaryHorizontal && primaryNav.length === 4;
      const shellOk = viewportWidth >= 1440
        ? shellMax.includes("1480") || shellMax.includes("145")
        : true;
      return {
        overflow,
        primaryOverflow,
        primaryTappable,
        primaryHorizontal,
        bottomNav,
        selectorBarVisible,
        sidebarVisible,
        selectorSticky,
        selectorNotFixed,
        pillCount,
        stepperVisible,
        stepperTappable,
        prevHidden,
        programModeLabel,
        sectionOk,
        primaryOk,
        shellOk,
        primaryCount: primaryNav.length,
        hasAriaCurrent: Boolean(activePrimary),
        shellMax,
      };
    }, width);

    if (metrics.overflow) horizontalOverflow = true;
    const pass =
      !metrics.overflow &&
      !metrics.primaryOverflow &&
      metrics.primaryTappable &&
      metrics.primaryCount === 4 &&
      metrics.sectionOk &&
      metrics.primaryOk &&
      metrics.shellOk &&
      metrics.stepperVisible &&
      metrics.stepperTappable &&
      metrics.prevHidden === true &&
      metrics.programModeLabel === "Program Mode" &&
      metrics.hasAriaCurrent;
    results[width] = { pass, ...metrics };
  }

  await browser.close();
  server.close();

  console.log(JSON.stringify({ results, horizontalOverflow }, null, 2));
  if (!WIDTHS.every((w) => results[w].pass)) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
