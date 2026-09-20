/**
 * Verify Program section has one outer section-card and no nested group borders.
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

async function setProgramMode(page, modeId) {
  await page.evaluate((id) => {
    const sel = document.getElementById("programMode");
    if (!sel) return;
    sel.value = id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, modeId);
  await page.waitForFunction(
    (id) => document.getElementById("programMode")?.value === id,
    { timeout: 30000 },
    modeId,
  );
  await new Promise((r) => setTimeout(r, 300));
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
  await page.waitForSelector(".base-loads-section.section-card", { timeout: 90000 });
  await page.goto(`${base}/index.html#/systems/temperatures`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(
    () => !document.getElementById("editor-app")?.hasAttribute("hidden"),
    { timeout: 120000 },
  );
  await setProgramMode(page, "ers");
  await page.goto(`${base}/index.html#/systems/program`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector('.program-ers-layout[data-program-mode="ers"]', { timeout: 90000 });

  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-systems-program .section-card.equip-card");
      const baseLoads = document.querySelector("#screen-systems-base-loads .base-loads-section.section-card");
      const cardStyle = (el) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          borderWidth: s.borderWidth,
          borderRadius: s.borderRadius,
          paddingTop: s.paddingTop,
          backgroundColor: s.backgroundColor,
        };
      };
      const bl = cardStyle(baseLoads);
      const outer = cardStyle(section);
      const outerBorderMatch = bl && outer
        ? bl.borderWidth === outer.borderWidth &&
          bl.borderRadius === outer.borderRadius &&
          bl.paddingTop === outer.paddingTop &&
          bl.backgroundColor === outer.backgroundColor
        : false;
      const innerGroups = [...(section?.querySelectorAll(".program-section-body > .spec-group") || [])];
      const innerGroupBorders = innerGroups.filter((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      }).length;
      const operatingHeading = !!section?.querySelector(".program-operating-group > h4");
      const operatingTitle = section?.querySelector(".program-operating-group > h4")?.textContent?.trim() || "";
      const checkboxUsable = (() => {
        const inputs = [...(section?.querySelectorAll('.program-operating-grid .check input[type="checkbox"]') || [])].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        return inputs.length >= 6 && inputs.every((el) => el.getBoundingClientRect().height >= 16);
      })();
      const selectBorder = (() => {
        const select = section?.querySelector('.program-hazardous-grid select');
        if (!select) return false;
        const s = getComputedStyle(select);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const evalInputBorder = (() => {
        const input = section?.querySelector(".program-evaluation-cost-row input");
        if (!input) return false;
        const s = getComputedStyle(input);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const toolbar = document.getElementById("programMode")?.value || "";
      return {
        overflow,
        outerBorderMatch,
        innerGroupBorders,
        innerGroupCount: innerGroups.length,
        operatingHeading,
        operatingTitle,
        checkboxUsable,
        selectBorder,
        evalInputBorder,
        toolbar,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });

    const pass =
      !metrics.overflow &&
      metrics.outerBorderMatch &&
      metrics.innerGroupBorders === 0 &&
      metrics.innerGroupCount >= 3 &&
      metrics.operatingHeading &&
      metrics.operatingTitle === "Operating & Program Conditions" &&
      metrics.checkboxUsable &&
      metrics.selectBorder &&
      metrics.evalInputBorder &&
      metrics.toolbar === "ers";
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
