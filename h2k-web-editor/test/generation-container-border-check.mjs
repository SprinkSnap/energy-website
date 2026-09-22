/**
 * Verify Generation outer section-card matches Base Loads container treatment.
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

function cardMetrics(el) {
  const s = getComputedStyle(el);
  return {
    borderWidth: s.borderWidth,
    borderStyle: s.borderStyle,
    borderColor: s.borderColor,
    borderRadius: s.borderRadius,
    paddingTop: s.paddingTop,
    paddingRight: s.paddingRight,
    paddingBottom: s.paddingBottom,
    paddingLeft: s.paddingLeft,
    marginBottom: s.marginBottom,
    backgroundColor: s.backgroundColor,
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
  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-base-loads .base-loads-section.section-card", { timeout: 90000 });
  await page.goto(`${base}/index.html#/systems/generation`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-generation-main .section-card", { timeout: 90000 });
  await page.evaluate(() => {
    const input = document.querySelector("#screen-systems-generation-main [data-generation-pv-count]");
    if (!input) return;
    input.value = "2";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".generation-local-nav a").length >= 3,
    { timeout: 90000 },
  );
  await page.goto(`${base}/index.html#/systems/generation/photovoltaic-system-1`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-systems-generation-pv .generation-power-section.section-card", { timeout: 90000 });
  await page.waitForSelector("#screen-systems-generation-pv .generation-pv-form", { timeout: 90000 });

  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate((cardMetricsSource) => {
      const cardMetrics = new Function(`return (${cardMetricsSource})`)();
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const baseLoads = document.querySelector("#screen-systems-base-loads .base-loads-section.section-card");
      const generation = document.querySelector("#screen-systems-generation-pv .generation-power-section.section-card");
      const bl = baseLoads ? cardMetrics(baseLoads) : null;
      const gen = generation ? cardMetrics(generation) : null;
      const borderMatch = bl && gen
        ? bl.borderWidth === gen.borderWidth &&
          bl.borderStyle === gen.borderStyle &&
          bl.borderColor === gen.borderColor &&
          bl.borderRadius === gen.borderRadius &&
          bl.paddingTop === gen.paddingTop &&
          bl.paddingRight === gen.paddingRight &&
          bl.paddingBottom === gen.paddingBottom &&
          bl.paddingLeft === gen.paddingLeft &&
          bl.marginBottom === gen.marginBottom &&
          bl.backgroundColor === gen.backgroundColor
        : false;
      const nestedCards = [...(generation?.querySelectorAll(".section-card") || [])].filter((el) => el !== generation);
      const doubleBorder = nestedCards.some((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      });
      const blGroup = document.querySelector("#screen-systems-base-loads .base-loads-section .spec-group");
      const genPvGroup = generation?.querySelector(".generation-pv-systems-group");
      const genOtherGroup = generation?.querySelector(".generation-pv-systems-group");
      const groupMetrics = (el) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          borderWidth: s.borderWidth,
          borderStyle: s.borderStyle,
          borderColor: s.borderColor,
          borderRadius: s.borderRadius,
          paddingTop: s.paddingTop,
          backgroundColor: s.backgroundColor,
        };
      };
      const blGroupStyle = groupMetrics(blGroup);
      const pvGroupStyle = groupMetrics(genPvGroup);
      const otherGroupStyle = groupMetrics(genOtherGroup);
      const innerGroupBorderMatch = blGroupStyle && pvGroupStyle
        ? blGroupStyle.borderWidth === pvGroupStyle.borderWidth &&
          blGroupStyle.borderStyle === pvGroupStyle.borderStyle &&
          blGroupStyle.borderColor === pvGroupStyle.borderColor &&
          blGroupStyle.borderRadius === pvGroupStyle.borderRadius &&
          blGroupStyle.paddingTop === pvGroupStyle.paddingTop &&
          blGroupStyle.backgroundColor === pvGroupStyle.backgroundColor
        : false;
      const innerGroupCount = generation?.querySelectorAll(".generation-pv-systems-group").length || 0;
      const usesSharedClass =
        generation?.classList.contains("section-card") && generation?.classList.contains("catalog-section");
      const innerLayout = generation?.querySelector(".generation-spec-layout");
      const innerUsesSpecLayout = innerLayout?.classList.contains("spec-layout") === true;
      const cardInsideViewport =
        !!generation &&
        generation.getBoundingClientRect().right <= doc.clientWidth + 1 &&
        generation.getBoundingClientRect().left >= -1;
      const innerGroups = [...(generation?.querySelectorAll(".spec-group") || [])];
      const innerGroupBorders = innerGroups.filter((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      }).length;
      const tabsContainer = generation?.querySelector(".basement-editor-tabs.generation-tabs");
      const tabsContainerBorder = (() => {
        if (!tabsContainer) return true;
        const s = getComputedStyle(tabsContainer);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      })();
      const tabButtonBorder = (() => {
        const btn = generation?.querySelector("[data-generation-tab]");
        if (!btn) return false;
        const s = getComputedStyle(btn);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const stepperBorder = (() => {
        const stepper = generation?.querySelector(".numeric-stepper");
        if (!stepper) return false;
        const s = getComputedStyle(stepper);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const inputBorder = (() => {
        const input = generation?.querySelector('.generation-pv-form input[data-xml-path*="EquipmentInformation/Manufacturer"]');
        if (!input) return false;
        const s = getComputedStyle(input);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const pvSubBlockBorders = [...(generation?.querySelectorAll(".pv-orientation-row, .pv-declination-row, .pv-module-block, .pv-efficiency-block") || [])].filter((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      }).length;
      const tabCount = generation?.querySelectorAll("[data-generation-tab]").length || 0;
      const activeTab = generation?.querySelector("[data-generation-tab].is-active")?.dataset.generationTab || "";
      return {
        overflow,
        borderMatch,
        doubleBorder,
        usesSharedClass,
        innerUsesSpecLayout,
        cardInsideViewport,
        generationClasses: generation?.className || "",
        innerGroupBorderMatch,
        innerGroupCount,
        innerGroupBorders,
        tabsContainerBorder,
        tabButtonBorder,
        stepperBorder,
        inputBorder,
        pvSubBlockBorders,
        tabCount,
        activeTab,
        blGroupStyle,
        pvGroupStyle,
        otherGroupStyle,
        bl,
        gen,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    }, cardMetrics.toString());

    const pass =
      !metrics.overflow &&
      metrics.borderMatch &&
      !metrics.doubleBorder &&
      metrics.usesSharedClass &&
      metrics.cardInsideViewport &&
      metrics.innerGroupBorderMatch &&
      metrics.innerGroupCount >= 1 &&
      metrics.innerGroupBorders === 0 &&
      metrics.tabsContainerBorder &&
      metrics.inputBorder &&
      metrics.pvSubBlockBorders === 0 &&
      metrics.tabCount >= 0 &&
      (metrics.activeTab === "1" || metrics.activeTab === "");
    results[width] = { pass, ...metrics };
  }

  await browser.close();
  server.close();

  console.log(JSON.stringify({ results }, null, 2));
  if (!WIDTHS.every((w) => results[w].pass)) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
