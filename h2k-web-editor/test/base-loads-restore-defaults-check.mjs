import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  !appJs.includes("data-base-loads-restore disabled"),
  "Restore Defaults button must not be rendered disabled by default",
);
assert(!appJs.includes("function baseLoadsHasChanges"), "baseLoadsHasChanges should not gate Restore Defaults");
assert(!appJs.includes("syncRestoreBtn"), "Restore Defaults must not sync disabled state from field edits");
assert(
  /function bindBaseLoadsGlobalControls\(root\)\{[\s\S]*restoreBaseLoadsDefaults\(\)/.test(appJs),
  "Restore Defaults click handler must call restoreBaseLoadsDefaults",
);

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
      const ext = filePath.slice(filePath.lastIndexOf("."));
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function restoreButtonState(page) {
  return page.evaluate(() => {
    const btn = document.querySelector("[data-base-loads-restore]");
    const userSpec = document.querySelector('[data-xml-path="/HouseFile/House/BaseLoads/@userSpecifiedUsage"]');
    const summaryField = document.querySelector(
      '[data-xml-path="/HouseFile/House/BaseLoads/Summary/@hotWaterLoad"]',
    );
    return {
      disabled: btn?.disabled === true,
      userSpecified: userSpec?.checked === true,
      summaryReadOnly: summaryField?.disabled === true,
    };
  });
}

const puppeteerPaths = [
  "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js",
  join(root, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"),
  join(root, "node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js"),
];
let puppeteer;
for (const p of puppeteerPaths) {
  if (!existsSync(p)) continue;
  puppeteer = await import(pathToFileURL(p).href);
  break;
}

if (puppeteer) {
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  const adultsPath = '[data-xml-path="/HouseFile/House/BaseLoads/Occupancy/Adults/@occupants"]';
  const userSpecPath = '[data-xml-path="/HouseFile/House/BaseLoads/@userSpecifiedUsage"]';
  const restoreSelector = "[data-base-loads-restore]";

  await page.goto(`${base}/index.html#/systems/base-loads`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector(restoreSelector, { timeout: 120000 });

  let state = await restoreButtonState(page);
  assert(state.disabled === false, "Restore Defaults must start enabled when user specified is unchecked");
  assert(state.userSpecified === false, "setup expects user specified unchecked");
  assert(state.summaryReadOnly === true, "summary fields should stay read-only when user specified is unchecked");

  await page.click(userSpecPath);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.checked === true,
    { timeout: 12000 },
    userSpecPath,
  );
  state = await restoreButtonState(page);
  assert(state.disabled === false, "Restore Defaults must stay enabled when user specified is checked");
  assert(state.summaryReadOnly === false, "summary fields should become editable when user specified is checked");

  await page.click(userSpecPath);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.checked === false,
    { timeout: 12000 },
    userSpecPath,
  );
  state = await restoreButtonState(page);
  assert(state.disabled === false, "Restore Defaults must stay enabled after toggling user specified off");

  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("adults occupants field missing");
    el.value = "9";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, adultsPath);
  state = await restoreButtonState(page);
  assert(state.disabled === false, "Restore Defaults must stay enabled after editing occupancy");

  for (const width of [375, 768, 1440]) {
    await page.setViewport({ width, height: 900 });
    await new Promise((r) => setTimeout(r, 100));
    const disabled = await page.evaluate(
      () => document.querySelector("[data-base-loads-restore]")?.disabled === true,
    );
    assert(disabled === false, `Restore Defaults must stay enabled at ${width}px`);
  }

  await page.click(restoreSelector);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.value === "2",
    { timeout: 12000 },
    adultsPath,
  );
  state = await restoreButtonState(page);
  assert(state.disabled === false, "Restore Defaults must remain enabled immediately after restore");
  assert(state.userSpecified === false, "restore must reset user specified to unchecked");

  await page.click(restoreSelector);
  await page.click(restoreSelector);
  state = await restoreButtonState(page);
  assert(state.disabled === false, "Restore Defaults must remain enabled after repeated clicks");
  const adultsAfterRepeat = await page.$eval(adultsPath, (el) => el.value);
  assert(adultsAfterRepeat === "2", "repeated restore must keep default occupancy");

  await browser.close();
  server.close();
} else {
  console.warn("base-loads-restore-defaults-check.mjs: skipped browser checks (puppeteer-core unavailable)");
}

console.log("base-loads-restore-defaults-check.mjs: all assertions passed");
