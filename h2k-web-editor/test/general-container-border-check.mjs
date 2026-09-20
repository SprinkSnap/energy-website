/**
 * Verify General has one outer section-card and no nested group borders.
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
  await page.goto(`${base}/index.html#/house/general`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector("#screen-house-general .general-section", { timeout: 90000 });
  await page.waitForSelector('#screen-house-general [data-group-id="file-identification"]', { timeout: 90000 });

  const results = {};

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 200));
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth > doc.clientWidth + 1;
      const section = document.querySelector("#screen-house-general .general-section.section-card");
      const layout = section?.querySelector(".general-spec-layout");
      const fileGroup = layout?.querySelector('[data-group-id="file-identification"]');
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
      const outer = cardStyle(section);
      const outerHasBorder = outer
        ? outer.borderWidth !== "0px" && getComputedStyle(section).borderTopStyle !== "none"
        : false;
      const nestedCards = [...(section?.querySelectorAll(".section-card") || [])].filter((el) => el !== section);
      const nestedCardBorder = nestedCards.some((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      });
      const innerGroups = [...(layout?.querySelectorAll(".spec-group") || [])];
      const innerGroupBorders = innerGroups.filter((el) => {
        const s = getComputedStyle(el);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      }).length;
      const fileGroupBorder = (() => {
        if (!fileGroup) return true;
        const s = getComputedStyle(fileGroup);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      })();
      const fileHeading = fileGroup?.querySelector("h4")?.textContent?.trim() || "";
      const requiredLabels = [
        "File ID",
        "Prev. File ID",
        "House ID",
        "Application Identifier",
        "Homeowner Authorization ID",
      ];
      const text = section?.textContent || "";
      const missingLabels = requiredLabels.filter((label) => !text.includes(label));
      const inputBorder = (() => {
        const input = fileGroup?.querySelector('input[data-xml-path*="Identification"]');
        if (!input) return false;
        const s = getComputedStyle(input);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const selectBorder = (() => {
        const select = section?.querySelector("select");
        if (!select) return false;
        const s = getComputedStyle(select);
        return s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
      })();
      const sectionHeadings = innerGroups
        .map((el) => el.querySelector(":scope > h4")?.textContent?.trim() || "")
        .filter(Boolean);
      const mailingGroupBorder = (() => {
        const group = layout?.querySelector(".general-mailing-group");
        if (!group) return true;
        const s = getComputedStyle(group);
        return s.borderTopWidth === "0px" || s.borderTopStyle === "none";
      })();
      return {
        overflow,
        outerHasBorder,
        nestedCardBorder,
        innerGroupBorders,
        innerGroupCount: innerGroups.length,
        fileGroupBorder,
        mailingGroupBorder,
        fileHeading,
        missingLabels,
        inputBorder,
        selectBorder,
        sectionHeadings,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });

    const pass =
      !metrics.overflow &&
      metrics.outerHasBorder &&
      !metrics.nestedCardBorder &&
      metrics.innerGroupBorders === 0 &&
      metrics.innerGroupCount >= 6 &&
      metrics.fileGroupBorder &&
      metrics.mailingGroupBorder &&
      metrics.fileHeading === "File identification" &&
      metrics.missingLabels.length === 0 &&
      metrics.inputBorder &&
      metrics.selectBorder &&
      metrics.sectionHeadings.includes("Property & ownership") &&
      metrics.sectionHeadings.includes("Submission options");
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
