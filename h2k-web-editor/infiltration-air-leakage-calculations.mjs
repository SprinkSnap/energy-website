/**
 * HOT2000-style blower-door multipoint calculations (fan flow + power-law fit).
 * Fan polynomials follow Energy Conservatory Minneapolis blower (Ring A/B).
 */

export const CFM_TO_M3S = 0.000471947443;

/** @param {string} ringCode */
export function blowerFanFlowCfm(fanPressurePa, ringCode = "1") {
  const p = Number(fanPressurePa);
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (String(ringCode) === "2") {
    return 0.022 * p * p + 0.008 * p;
  }
  return 0.087 * p * p + 0.033 * p;
}

/**
 * @param {Array<{housePressure:number,fanPressure:number,flowRangeCode:string,valid?:boolean}>} points
 * @param {{heatedVolumeM3:number, barometricKPa?:number, insideTempC?:number, outsideTempC?:number}} env
 */
export function computeAirLeakageTestResults(points, env) {
  const volumeM3 = Number(env.heatedVolumeM3);
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0) {
    return emptyResults();
  }
  const baro = Number(env.barometricKPa);
  const baroFactor = Number.isFinite(baro) && baro > 0 ? 101.325 / baro : 1;
  const tin = Number(env.insideTempC);
  const tout = Number(env.outsideTempC);
  const tempFactor =
    Number.isFinite(tin) && Number.isFinite(tout) ? (273 + tin) / (273 + (tin + tout) / 2) : 1;

  const rows = points.map((pt) => {
    const housePa = Number(pt.housePressure);
    const fanPa = Number(pt.fanPressure);
    const measuredFlowCfm = blowerFanFlowCfm(fanPa, pt.flowRangeCode);
    const correctedPressurePa =
      Math.abs(housePa) > 0 ? Math.abs(housePa) * baroFactor * tempFactor : 0;
    const correctedFlowCfm = measuredFlowCfm > 0 && correctedPressurePa > 0
      ? measuredFlowCfm * Math.pow(correctedPressurePa / Math.max(fanPa, 0.001), 0.5)
      : 0;
    return {
      housePressure: housePa,
      fanPressure: fanPa,
      flowRangeCode: pt.flowRangeCode,
      measuredFlowCfm,
      correctedPressurePa,
      correctedFlowCfm,
      valid: Math.abs(housePa) >= 1 && fanPa > 0,
    };
  });

  const valid = rows.filter((r) => r.valid);
  if (valid.length < 2) {
    return { rows, summary: emptyResults() };
  }

  const xs = [];
  const ys = [];
  for (const r of valid) {
    xs.push(Math.log(r.correctedPressurePa));
    ys.push(Math.log(Math.max(r.correctedFlowCfm, 0.001)));
  }
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, v, i) => a + v * ys[i], 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) {
    return { rows, summary: emptyResults() };
  }
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const flowExponent = slope;
  const flowCoefficientCfm = Math.exp(intercept);

  let ssRes = 0;
  let ssTot = 0;
  const yMean = sy / n;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const correlation = ssTot > 0 ? Math.sqrt(Math.max(0, 1 - ssRes / ssTot)) : 0;

  const q50Cfm = flowCoefficientCfm * 50 ** flowExponent;
  const ach50 = (q50Cfm * 60) / (volumeM3 * 35.314666721);
  const ela10Cm2 = ach50 * volumeM3 * (763.2541 / (3 * 681.3603));

  let errSum = 0;
  let errCount = 0;
  for (const r of valid) {
    const predFlow = flowCoefficientCfm * r.correctedPressurePa ** flowExponent;
    const errPct = predFlow > 0 ? ((r.correctedFlowCfm - predFlow) / predFlow) * 100 : 0;
    r.errorPct = errPct;
    errSum += Math.abs(errPct);
    errCount++;
  }
  for (const r of rows) {
    if (r.errorPct == null) r.errorPct = 0;
  }

  return {
    rows,
    summary: {
      flowCoefficient: flowCoefficientCfm,
      flowExponent,
      correlationCoefficient: correlation,
      ach50,
      heatedVolumeM3: volumeM3,
      ela10PaCm2: ela10Cm2,
      relativeErrorPct: errCount ? errSum / errCount : 0,
    },
  };
}

function emptyResults() {
  return {
    flowCoefficient: 0,
    flowExponent: 0,
    correlationCoefficient: 0,
    ach50: 0,
    heatedVolumeM3: 0,
    ela10PaCm2: 0,
    relativeErrorPct: 0,
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.InfiltrationAirLeakageCalc = {
    CFM_TO_M3S,
    blowerFanFlowCfm,
    computeAirLeakageTestResults,
  };
}
