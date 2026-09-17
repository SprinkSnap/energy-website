/**
 * Compare Natural Air Infiltration tab buttons against Base Loads reference buttons.
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
  ".h2k": "application/json",
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

function styleSnapshot(el) {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    minHeight: cs.minHeight,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    borderRadius: cs.borderRadius,
    fontWeight: cs.fontWeight,
    fontSize: cs.fontSize,
    height: Math.round(r.height),
    width: Math.round(r.width),
  };
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

    await page.goto(`${base}/index.html#/systems/base-loads/water-usage`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector(".base-loads-local-nav .base-loads-local-nav-item", { timeout: 90000 });
    const baseLoadsRef = await page.evaluate(() => {
      const doc = document.documentElement;
      const navItem = document.querySelector(".base-loads-local-nav .base-loads-local-nav-item");
      const actionBtn = document.querySelector(".base-loads-actions .button.secondary");
      const navItems = [...document.querySelectorAll(".base-loads-local-nav .base-loads-local-nav-item")];
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const styleSnapshot = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          minHeight: cs.minHeight,
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
          borderRadius: cs.borderRadius,
          fontWeight: cs.fontWeight,
          fontSize: cs.fontSize,
          height: Math.round(r.height),
        };
      };
      const inactiveNav = navItems.find((el) => !el.classList.contains("active"));
      const activeNav = navItems.find((el) => el.classList.contains("active"));
      const navOverflow = navItems.some((el) => el.getBoundingClientRect().right > doc.clientWidth + 2);
      return {
        inactiveNav: inactiveNav ? styleSnapshot(inactiveNav) : null,
        activeNav: activeNav ? styleSnapshot(activeNav) : null,
        actionBtn: actionBtn ? styleSnapshot(actionBtn) : null,
        navTappable: navItems.filter(isVisible).every((el) => el.getBoundingClientRect().height >= 40),
        navOverflow,
        navUsesSharedClass: navItem?.classList.contains("base-loads-local-nav-item"),
        actionUsesSharedClass: actionBtn?.classList.contains("button"),
      };
    });

    await page.goto(`${base}/index.html#/systems/natural-air-infiltration`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector(".infiltration-local-nav .base-loads-local-nav-item", { timeout: 90000 });
    const infiltration = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const tabItems = [...document.querySelectorAll(".infiltration-local-nav .base-loads-local-nav-item")];
      const legacyTabs = document.querySelectorAll(".infiltration-tabs .basement-tab-btn").length;
      const isVisible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const styleSnapshot = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          minHeight: cs.minHeight,
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
          borderRadius: cs.borderRadius,
          fontWeight: cs.fontWeight,
          fontSize: cs.fontSize,
          height: Math.round(r.height),
        };
      };
      const inactiveTab = tabItems.find((el) => !el.classList.contains("active"));
      const activeTab = tabItems.find((el) => el.classList.contains("active"));
      const tabOverflow = tabItems.some((el) => el.getBoundingClientRect().right > doc.clientWidth + 2);
      const stacksOnMobile =
        window.innerWidth >= 640 || tabItems.length < 2
          ? true
          : tabItems.every((el, i) => {
              if (i === 0) return true;
              const prev = tabItems[i - 1].getBoundingClientRect();
              const cur = el.getBoundingClientRect();
              return cur.top >= prev.bottom - 2 || cur.left >= prev.left;
            });
      return {
        overflow,
        tabCount: tabItems.length,
        legacyTabs,
        inactiveTab: inactiveTab ? styleSnapshot(inactiveTab) : null,
        activeTab: activeTab ? styleSnapshot(activeTab) : null,
        tabTappable: tabItems.filter(isVisible).every((el) => el.getBoundingClientRect().height >= 40),
        tabOverflow,
        stacksOnMobile,
        usesSharedClass: tabItems.every((el) => el.classList.contains("base-loads-local-nav-item")),
      };
    });

    if (infiltration.overflow || infiltration.tabOverflow) horizontalOverflow = true;

    const styleMatches = (a, b) =>
      a &&
      b &&
      a.minHeight === b.minHeight &&
      a.borderRadius === b.borderRadius &&
      a.fontWeight === b.fontWeight &&
      a.paddingTop === b.paddingTop &&
      a.paddingBottom === b.paddingBottom &&
      a.fontSize === b.fontSize;

    const navMatches =
      styleMatches(baseLoadsRef.inactiveNav, infiltration.inactiveTab) &&
      styleMatches(baseLoadsRef.activeNav, infiltration.activeTab);

    const pass =
      !infiltration.overflow &&
      !infiltration.tabOverflow &&
      infiltration.tabCount === 2 &&
      infiltration.legacyTabs === 0 &&
      infiltration.usesSharedClass &&
      infiltration.tabTappable &&
      baseLoadsRef.navTappable &&
      navMatches &&
      infiltration.stacksOnMobile;

    results[width] = { pass, baseLoadsRef, infiltration, navMatches };
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
