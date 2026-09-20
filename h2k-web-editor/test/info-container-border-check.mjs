/**
 * Verify House Info has one outer section-card and no nested group borders.
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
  await page.goto(`${base}/index.html#/house/info`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-house-info .info-section", { timeout: 90000 });
  await page.waitForSelector("#screen-house-info .info-records-group", { timeout: 90000 });

  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-house-info .info-section.section-card");
      const layout = section?.querySelector(".info-spec-layout");
      const recordsGroup = layout?.querySelector(".info-records-group");
      const actionsGroup = layout?.querySelector(".info-actions-group");
      const recordsList = section?.querySelector(".info-records-list");
      const outerHasBorder = (() => {
        if (!section) return false;
        const s = getComputedStyle(section);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const innerGroups = [...(layout?.querySelectorAll(".spec-group") || [])];
      const innerGroupBorders = innerGroups.filter((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      }).length;
      const recordsGroupBorder = (() => {
        if (!recordsGroup) return true;
        const s = getComputedStyle(recordsGroup);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      })();
      const actionsGroupBorder = (() => {
        if (!actionsGroup) return true;
        const s = getComputedStyle(actionsGroup);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      })();
      const listBoundary = (() => {
        if (!recordsList) return false;
        const s = getComputedStyle(recordsList);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const rowCardBorders = [...(section?.querySelectorAll(".info-record-row") || [])].filter((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none" && s.borderTopWidth !== "1px";
      }).length;
      const rowSeparators = (() => {
        const rows = [...(section?.querySelectorAll(".info-record-row") || [])];
        if (!rows.length) return false;
        if (rows.length === 1) return true;
        return rows.slice(0, -1).some((row) => {
          const s = getComputedStyle(row);
          return s.borderBottomWidth !== "0px" && s.borderBottomStyle !== "none";
        });
      })();
      const duplicateListBorder = recordsGroup && recordsList
        ? (() => {
            const groupStyle = getComputedStyle(recordsGroup);
            const listStyle = getComputedStyle(recordsList);
            const groupBordered = groupStyle.borderTopWidth !== "0px" && groupStyle.borderTopStyle !== "none";
            const listBordered = listStyle.borderTopWidth !== "0px" && listStyle.borderTopStyle !== "none";
            return groupBordered && listBordered;
          })()
        : false;
      const recordsHeading = recordsGroup?.querySelector("h4")?.textContent?.trim() || "";
      const actionsHeading = actionsGroup?.querySelector("h4")?.textContent?.trim() || "";
      const inputBorder = (() => {
        const input = section?.querySelector(".info-record-field input");
        if (!input) return false;
        const s = getComputedStyle(input);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const buttonBorder = (() => {
        const btn = section?.querySelector("#infoAddBtn");
        if (!btn) return false;
        const s = getComputedStyle(btn);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const deleteDisabled = section?.querySelector("#infoDeleteBtn")?.disabled === true;
      const prevBtn = document.querySelector('[data-section-stepper-prev="house"]');
      const nextBtn = document.querySelector('[data-section-stepper-next="house"]');
      const navVisible = Boolean(prevBtn && nextBtn && nextBtn.getBoundingClientRect().height >= 40);
      const hasTableHead = (() => {
        const head = section?.querySelector(".info-records-head");
        if (!head) return false;
        return getComputedStyle(head).display !== "none";
      })();
      return {
        overflow,
        outerHasBorder,
        innerGroupBorders,
        innerGroupCount: innerGroups.length,
        recordsGroupBorder,
        actionsGroupBorder,
        listBoundary,
        rowCardBorders,
        recordsHeading,
        actionsHeading,
        inputBorder,
        buttonBorder,
        deleteDisabled,
        navVisible,
        rowSeparators,
        duplicateListBorder,
        hasTableHead,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });

    const desktop = width >= 768;
    const pass =
      !metrics.overflow &&
      metrics.outerHasBorder &&
      metrics.innerGroupBorders === 0 &&
      metrics.innerGroupCount >= 2 &&
      metrics.recordsGroupBorder &&
      metrics.actionsGroupBorder &&
      !metrics.duplicateListBorder &&
      metrics.rowCardBorders === 0 &&
      metrics.recordsHeading === "Record List" &&
      metrics.actionsHeading === "List Actions" &&
      metrics.inputBorder &&
      metrics.buttonBorder &&
      metrics.deleteDisabled &&
      metrics.navVisible &&
      (desktop ? metrics.listBoundary && metrics.hasTableHead : !metrics.listBoundary && metrics.rowSeparators);
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
