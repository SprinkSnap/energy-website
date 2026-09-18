/**
 * Section navigation: sticky selector (mobile/tablet) vs sidebar (desktop).
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

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.goto(`${base}/index.html#/systems/ventilation`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForFunction(
      () => !document.getElementById("editor-app")?.hasAttribute("hidden")
        && (document.querySelector('[data-section-select="systems"]')?.options?.length || 0) > 0,
      { timeout: 120000 },
    );

    const metrics = await page.evaluate((viewportWidth) => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const selectorBar = document.querySelector('[data-section-selector-bar="systems"]');
      const selector = document.querySelector('[data-section-select="systems"]');
      const sidebar = document.querySelector('[data-section-nav="systems"] .section-nav-sidebar');
      const selectorStyle = selectorBar ? getComputedStyle(selectorBar) : null;
      const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
      const selectorVisible = selectorBar && isVisible(selectorBar);
      const sidebarVisible = sidebar && isVisible(sidebar);
      const selectorSticky = selectorStyle?.position === "sticky";
      const selectorNotFixed = selectorStyle?.position !== "fixed";
      const sidebarSticky = sidebarStyle?.position === "sticky";
      const sidebarNotFixed = sidebarStyle?.position !== "fixed";
      const selectorHeight = selector ? selector.getBoundingClientRect().height : 0;
      const selectorTappable = selectorHeight >= 44 && selectorHeight <= 56;
      const selectorCompact = selectorHeight >= 48 && selectorHeight <= 56;
      const selectOptions = [...(selector?.options || [])].map((o) => o.textContent.trim());
      const waterInSelect = selectOptions.some((t) => /^water usage$/i.test(t));
      const sidebarLinks = [...document.querySelectorAll('[data-nav="systems"] .subnav-links a')].filter(isVisible);
      const waterInSidebar = sidebarLinks.some((a) => /^water usage$/i.test(a.textContent.trim()));
      const activeSidebar = document.querySelector('[data-nav="systems"] .subnav-links a.active');
      const hash = location.hash;
      const mobileMode = viewportWidth < 960;
      const presentationOk = mobileMode
        ? selectorVisible && !sidebarVisible && selectorSticky && selectorNotFixed
        : !selectorVisible && sidebarVisible && sidebarSticky && sidebarNotFixed;
      const activeOk = mobileMode
        ? selector?.value === "ventilation"
        : activeSidebar?.getAttribute("href")?.includes("ventilation");
      const appbar = document.querySelector(".appbar");
      const stepNav = document.querySelector(".step-nav");
      const selectorTop = selectorBar?.getBoundingClientRect().top ?? 0;
      const appbarBottom = appbar?.getBoundingClientRect().bottom ?? 0;
      const stepNavBottom = viewportWidth >= 768 && stepNav
        ? stepNav.getBoundingClientRect().bottom
        : appbarBottom;
      const stacksBelowHeader = mobileMode
        ? selectorTop >= stepNavBottom - 2
        : true;
      return {
        overflow,
        presentationOk,
        activeOk,
        selectorTappable,
        selectorHeight,
        selectorCompact,
        waterInSelect,
        waterInSidebar,
        stacksBelowHeader,
        optionCount: selectOptions.length,
        sidebarCount: sidebarLinks.length,
        hash,
        mobileMode,
      };
    }, width);

    results[width] = {
      pass:
        !metrics.overflow &&
        metrics.presentationOk &&
        metrics.activeOk &&
        (metrics.mobileMode ? metrics.selectorTappable && metrics.selectorCompact : true) &&
        !metrics.waterInSelect &&
        !metrics.waterInSidebar &&
        metrics.stacksBelowHeader &&
        metrics.hash.includes("ventilation"),
      ...metrics,
    };
  }

  // Resize preserves active section
  await page.setViewport({ width: 1024, height: 900 });
  await page.goto(`${base}/index.html#/systems/ventilation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => !document.getElementById("editor-app")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );
  await page.setViewport({ width: 430, height: 900 });
  await new Promise((r) => setTimeout(r, 300));
  const afterShrink = await page.evaluate(() => ({
    hash: location.hash,
    selectValue: document.querySelector('[data-section-select="systems"]')?.value,
  }));
  await page.setViewport({ width: 1024, height: 900 });
  await new Promise((r) => setTimeout(r, 300));
  const afterGrow = await page.evaluate(() => ({
    hash: location.hash,
    activeHref: document.querySelector('[data-nav="systems"] .subnav-links a.active')?.getAttribute("href"),
  }));

  // Base Loads water nested
  await page.setViewport({ width: 375, height: 900 });
  await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => !document.getElementById("editor-app")?.hasAttribute("hidden")
      && document.querySelector('[data-section-select="systems"]')?.value === "base-loads",
    { timeout: 120000 },
  );
  const baseLoadsNested = await page.evaluate(() => ({
    hash: location.hash,
    systemsSelect: document.querySelector('[data-section-select="systems"]')?.value,
    localNav: document.querySelector(".base-loads-local-nav")?.checkVisibility?.() ?? false,
    waterGlobal: [...(document.querySelector('[data-section-select="systems"]')?.options || [])]
      .some((o) => /^water usage$/i.test(o.textContent.trim())),
  }));

  await browser.close();
  server.close();

  const resizeOk =
    afterShrink.hash.includes("ventilation") &&
    afterShrink.selectValue === "ventilation" &&
    afterGrow.hash.includes("ventilation") &&
    afterGrow.activeHref?.includes("ventilation");
  const nestedOk =
    baseLoadsNested.hash.includes("water-usage") &&
    baseLoadsNested.systemsSelect === "base-loads" &&
    baseLoadsNested.localNav &&
    !baseLoadsNested.waterGlobal;

  console.log(JSON.stringify({ results, resizeOk, nestedOk }, null, 2));
  if (!WIDTHS.every((w) => results[w].pass) || !resizeOk || !nestedOk) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
