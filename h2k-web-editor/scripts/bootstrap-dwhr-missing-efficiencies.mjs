/**
 * One-time bootstrap for bundled DWHR catalog rows still at placeholder 0.
 * Power-Pipe: UK technical manual (9.0 L/min) scaled to HOT2000 regression anchors at 9.5 L/min.
 * Ecodrain: piecewise-linear fill on V1000/VT lengths using regression anchor rows.
 *
 * Replace with `npm run import:dwhr-catalog` once DWHR_Efficiency_Data_Entry(3).xlsx is committed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DWHR_REGRESSION_SPOT_CHECKS } from "../test/dwhr-regression-spot-checks.mjs";
import { ECODRAIN_MODEL_IDS } from "../dwhr-legacy-model-lists.mjs";
import { validateDwhrProductCatalog } from "../dwhr-catalog-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "data/dwhr-products.json");
const ukPdf = process.env.DWHR_UK_POWER_PIPE_PDF || "/tmp/pp-manual.pdf";

/** @param {string} pdfPath */
function loadUkPowerPipeEffectiveness(pdfPath) {
  const py = `
import pdfplumber, re, json, sys
with pdfplumber.open(sys.argv[1]) as pdf:
    full = "\\n".join((p.extract_text() or "") for p in pdf.pages)
out = {}
for line in full.splitlines():
    m = re.match(r"^(C3|C4|R2|R3|R4)-(\\d+)\\b", line.strip())
    if not m:
        continue
    nums = re.findall(r"\\d+\\.\\d+", line)
    if len(nums) < 4:
        continue
    eff = float(nums[3])
    out[f"{m.group(1)}-{m.group(2)}"] = eff
print(json.dumps(out))
`;
  const run = spawnSync("python3", ["-c", py, pdfPath], { encoding: "utf8" });
  if (run.status !== 0) {
    throw new Error(run.stderr || run.stdout || "Failed to parse UK Power-Pipe PDF");
  }
  return JSON.parse(run.stdout.trim());
}

/**
 * @param {[number, number][]} anchors length -> hot efficiency
 * @param {Record<string, number>} uk
 * @param {string} prefix
 */
function hotFromUkAnchors(prefix, anchors, uk) {
  const scaled = anchors.map(([len, hot]) => {
    const ukEff = ukEffAt(uk, prefix, len);
    return [len, hot / ukEff];
  });
  return (length) => {
    const ukEff = ukEffAt(uk, prefix, length);
    if (length <= scaled[0][0]) return ukEff * scaled[0][1];
    for (let i = 0; i < scaled.length - 1; i += 1) {
      const [l0, s0] = scaled[i];
      const [l1, s1] = scaled[i + 1];
      if (length <= l1) {
        const t = (length - l0) / (l1 - l0);
        const s = s0 + t * (s1 - s0);
        return ukEff * s;
      }
    }
    const [lLast, sLast] = scaled[scaled.length - 1];
    return ukEff * sLast;
  };
}

function roundEff(n) {
  return Math.round(n * 10) / 10;
}

/** @returns {Record<string, number>} */
/**
 * @param {Record<string, number>} uk
 * @param {string} prefix
 * @param {number} length
 */
function ukEffAt(uk, prefix, length) {
  const key = `${prefix}-${length}`;
  if (uk[key] != null) return uk[key];
  const lengths = Object.keys(uk)
    .filter((k) => k.startsWith(`${prefix}-`))
    .map((k) => Number(k.slice(prefix.length + 1)))
    .sort((a, b) => a - b);
  if (length <= lengths[0]) return uk[`${prefix}-${lengths[0]}`];
  if (length >= lengths[lengths.length - 1]) return uk[`${prefix}-${lengths[lengths.length - 1]}`];
  for (let i = 0; i < lengths.length - 1; i += 1) {
    const l0 = lengths[i];
    const l1 = lengths[i + 1];
    if (length <= l1) {
      const u0 = uk[`${prefix}-${l0}`];
      const u1 = uk[`${prefix}-${l1}`];
      const t = (length - l0) / (l1 - l0);
      return u0 + t * (u1 - u0);
    }
  }
  throw new Error(`UK effectiveness missing for ${prefix}-${length}`);
}

function buildPowerPipeHotEffectiveness(uk) {
  /** @type {Record<string, (len: number) => number>} */
  const seriesFn = {
    C3: hotFromUkAnchors("C3", [[30, 23.8], [60, 44.8], [120, 61.2]], uk),
    C4: hotFromUkAnchors("C4", [[120, 67.4]], uk),
    R2: hotFromUkAnchors("R2", [[24, 19.9]], uk),
    R3: hotFromUkAnchors("R3", [[60, 56.7], [120, 71.1]], uk),
    R4: hotFromUkAnchors("R4", [[120, 72.8]], uk),
  };
  /** @type {Record<string, number>} */
  const out = {};
  for (const prefix of ["C3", "C4", "R2", "R3", "R4"]) {
    const lengths = new Set();
    for (const key of Object.keys(uk)) {
      const m = key.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (m) lengths.add(Number(m[1]));
    }
    for (const row of JSON.parse(readFileSync(jsonPath, "utf8"))) {
      if (row.manufacturer !== "Power-Pipe") continue;
      const m = row.model.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (m) lengths.add(Number(m[1]));
    }
    const fn = seriesFn[prefix];
    for (const len of lengths) {
      out[`${prefix}-${len}`] = roundEff(fn(len));
    }
  }
  const x2Anchors = [[24, 25.0], [96, 61.5]];
  for (const model of ["X2-24", "X2-36", "X2-60", "X2-72", "X2-96"]) {
    const len = Number(model.slice(3));
    let hot;
    if (len <= x2Anchors[0][0]) hot = x2Anchors[0][1];
    else if (len >= x2Anchors[1][0]) {
      hot = x2Anchors[1][1];
    } else {
      const [l0, h0] = x2Anchors[0];
      const [l1, h1] = x2Anchors[1];
      const t = (len - l0) / (l1 - l0);
      hot = h0 + t * (h1 - h0);
    }
    out[model] = roundEff(hot);
  }
  return out;
}

/** @returns {Record<string, number>} */
function buildEcodrainHotEffectiveness() {
  /** @type {Record<string, number>} */
  const known = {};
  for (const [mfg, model, eff] of DWHR_REGRESSION_SPOT_CHECKS) {
    if (mfg === "Ecodrain") known[model] = eff;
  }
  /** @param {string} model */
  const parseLen = (model) => {
    const parts = model.split("-");
    return Number(parts[parts.length - 1]);
  };
  /** @param {string} familyPrefix e.g. V1000-3 */
  const fillFamily = (familyPrefix) => {
    const models = ECODRAIN_MODEL_IDS.filter((id) => id.startsWith(`${familyPrefix}-`));
    const points = models
      .filter((id) => known[id] != null)
      .map((id) => [parseLen(id), known[id]])
      .sort((a, b) => a[0] - b[0]);
    if (points.length < 2) return;
    for (const id of models) {
      if (known[id] != null) continue;
      const len = parseLen(id);
      if (len <= points[0][0]) {
        known[id] = points[0][1];
        continue;
      }
      if (len >= points[points.length - 1][0]) {
        const [l0, e0] = points[points.length - 2] ?? points[points.length - 1];
        const [l1, e1] = points[points.length - 1];
        const slope = (e1 - e0) / (l1 - l0);
        known[id] = roundEff(e1 + slope * (len - l1));
        continue;
      }
      for (let i = 0; i < points.length - 1; i += 1) {
        const [l0, e0] = points[i];
        const [l1, e1] = points[i + 1];
        if (len <= l1) {
          const t = (len - l0) / (l1 - l0);
          known[id] = roundEff(e0 + t * (e1 - e0));
          break;
        }
      }
    }
  };
  fillFamily("V1000-3");
  const v1003At = (len) => {
    const pts = ECODRAIN_MODEL_IDS.filter((id) => id.startsWith("V1000-3-") && known[id] != null)
      .map((id) => [parseLen(id), known[id]])
      .sort((a, b) => a[0] - b[0]);
    if (pts.length < 2) throw new Error("V1000-3 anchors required");
    if (len <= pts[0][0]) return pts[0][1];
    if (len >= pts[pts.length - 1][0]) {
      const [l0, e0] = pts[pts.length - 2];
      const [l1, e1] = pts[pts.length - 1];
      const slope = (e1 - e0) / (l1 - l0);
      return roundEff(e1 + slope * (len - l1));
    }
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [l0, e0] = pts[i];
      const [l1, e1] = pts[i + 1];
      if (len <= l1) {
        const t = (len - l0) / (l1 - l0);
        return roundEff(e0 + t * (e1 - e0));
      }
    }
    return pts[pts.length - 1][1];
  };
  const v1004Models = ECODRAIN_MODEL_IDS.filter((id) => id.startsWith("V1000-4-"));
  const anchor72 = known["V1000-4-72"];
  if (anchor72 == null) throw new Error("V1000-4-72 anchor required");
  const scale = anchor72 / v1003At(72);
  for (const id of v1004Models) {
    if (known[id] != null) continue;
    known[id] = roundEff(v1003At(parseLen(id)) * scale);
  }
  const vtKnown = ECODRAIN_MODEL_IDS.filter((id) => id.startsWith("VT-") && known[id] != null);
  if (vtKnown.length === 0) {
    for (const vt of ECODRAIN_MODEL_IDS.filter((id) => id.startsWith("VT-"))) {
      const len = parseLen(vt);
      const vPrefix = vt.includes("-4-") ? "V1000-4" : "V1000-3";
      const vModel = `${vPrefix}-${len}`;
      if (known[vModel] != null) known[vt] = known[vModel];
      else {
        const close = ECODRAIN_MODEL_IDS.find(
          (id) => id.startsWith(`${vPrefix}-`) && known[id] != null && Math.abs(parseLen(id) - len) <= 6,
        );
        if (close) known[vt] = known[close];
      }
    }
  }
  fillFamily("VT-1000-3");
  fillFamily("VT-1000-4");
  for (const id of ECODRAIN_MODEL_IDS) {
    if (known[id] == null) throw new Error(`Ecodrain bootstrap missing ${id}`);
  }
  return known;
}

function formatGeneratedModule(products) {
  validateDwhrProductCatalog(products);
  const body = JSON.stringify(products, null, 2);
  return `/** Auto-generated from Model Catalog — do not edit. Run: npm run apply:dwhr-regression-efficiencies */\nexport const DWHR_PRODUCTS = ${body};\n`;
}

function main() {
  const uk = loadUkPowerPipeEffectiveness(ukPdf);
  const pp = buildPowerPipeHotEffectiveness(uk);
  const eco = buildEcodrainHotEffectiveness();
  const products = JSON.parse(readFileSync(jsonPath, "utf8"));
  for (const row of products) {
    if (row.efficiencyAt9_5LMin !== 0) continue;
    if (row.manufacturer === "Power-Pipe") {
      const eff = pp[row.model];
      if (eff == null) throw new Error(`Power-Pipe bootstrap missing ${row.model}`);
      row.efficiencyAt9_5LMin = eff;
    } else if (row.manufacturer === "Ecodrain") {
      row.efficiencyAt9_5LMin = eco[row.model];
    }
  }
  for (const [mfg, model, expected] of DWHR_REGRESSION_SPOT_CHECKS) {
    const row = products.find((p) => p.manufacturer === mfg && p.model === model);
    if (!row || row.efficiencyAt9_5LMin !== expected) {
      throw new Error(`Regression mismatch after bootstrap ${mfg} / ${model}`);
    }
  }
  writeFileSync(jsonPath, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  writeFileSync(join(root, "dwhr-model-catalog.generated.mjs"), formatGeneratedModule(products), "utf8");
  const zeros = products.filter((p) => !p.efficiencyAt9_5LMin).length;
  console.log(`bootstrap-dwhr-missing-efficiencies: patched catalog (${zeros} zeros remaining)`);
}

main();
