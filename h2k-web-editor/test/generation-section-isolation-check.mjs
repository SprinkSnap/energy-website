/**
 * Verify Generation screens and local nav are visible only on the Generation section.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  stylesCss.includes("#view-systems #screen-systems-generation-main:not(.active)"),
  "inactive generation main screen forced hidden",
);
assert(
  !stylesCss.includes("#screen-systems-generation-main, #screen-systems-generation-pv"),
  "malformed generation comma selectors removed",
);

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

function visibility(el) {
  if (!el) return { visible: false, display: "" };
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const visible = s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  return { visible, display: s.display };
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
    console.log("generation-section-isolation-check.mjs: static assertions passed (puppeteer unavailable)");
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

  const routes = [
    { hash: "#/systems/temperatures", label: "temperatures", expectGeneration: false },
    { hash: "#/systems/base-loads", label: "base-loads", expectGeneration: false },
    { hash: "#/systems/natural-air-infiltration", label: "infiltration", expectGeneration: false },
    { hash: "#/systems/ventilation", label: "ventilation", expectGeneration: false },
    { hash: "#/systems/domestic-hot-water", label: "dhw", expectGeneration: false },
    { hash: "#/systems/generation", label: "generation-main", expectGeneration: true },
    { hash: "#/systems/generation/photovoltaic-system-1", label: "generation-pv", expectGeneration: true },
  ];

  for (const route of routes) {
    await page.goto(`${base}/index.html${route.hash}`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.waitForSelector("#view-systems.active", { timeout: 90000 });
    const state = await page.evaluate((visibilitySource) => {
      const visibility = new Function(`return (${visibilitySource})`)();
      const main = document.querySelector("#screen-systems-generation-main");
      const pv = document.querySelector("#screen-systems-generation-pv");
      const navHost = document.querySelector("[data-generation-local-nav-host]");
      const active = document.querySelector("#view-systems .screen.active");
      const genCountVisible = visibility(
        document.querySelector("#screen-systems-generation-main [data-generation-pv-count]"),
      ).visible;
      const genCount = Number(document.querySelector("[data-generation-pv-count]")?.value || 0);
      return {
        activeScreen: active?.id || "",
        main: visibility(main),
        pv: visibility(pv),
        navHostHidden: navHost?.hidden === true,
        genCountVisible,
        genCount,
      };
    }, visibility.toString());

    if (route.expectGeneration) {
      assert(
        state.main.visible || state.pv.visible,
        `${route.label}: expected a generation screen visible`,
      );
      assert(
        state.genCount === 0 ? state.navHostHidden === true : state.navHostHidden === false,
        `${route.label}: generation local nav visibility matches PV count`,
      );
    } else {
      assert(!state.main.visible, `${route.label}: generation main must be hidden (${state.main.display})`);
      assert(!state.pv.visible, `${route.label}: generation pv must be hidden (${state.pv.display})`);
      assert(!state.genCountVisible, `${route.label}: PV count control must not be visible`);
      assert(state.navHostHidden === true, `${route.label}: generation local nav must be hidden`);
      assert(
        !state.activeScreen.startsWith("screen-systems-generation"),
        `${route.label}: active screen must not be generation`,
      );
    }
  }

  await browser.close();
  server.close();
  console.log("generation-section-isolation-check.mjs: all assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
