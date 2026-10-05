/**
 * Authoritative ThermoDrain efficiencies at 9.5 L/min (%) from HOT2000 Model Catalog.
 * Model ids match bundled DWHR_PRODUCTS (see dwhr-legacy-model-lists thermoDrainModelIds).
 */
import { DWHR_REGRESSION_SPOT_CHECKS } from "../test/dwhr-regression-spot-checks.mjs";
import { thermoDrainModelIds } from "../dwhr-legacy-model-lists.mjs";

/** @type {Record<string, number>} */
const THERMODRAIN_ADDITIONAL_EFFICIENCIES = {
  TD442B: 46.0,
  TD460B: 57.3,
  TD472B: 58.4,
  TDH3320B: 41.0,
  TDH3325B: 41.4,
  TDH3330B: 41.8,
  TDH3335B: 42.1,
  TDH3340B: 42.5,
  TDH3345B: 42.8,
  TDH3350B: 43.2,
  TDH3355B: 43.5,
  TDH3360B: 43.8,
  TDH3365B: 44.2,
  TDH3370B: 44.5,
  TDH3375B: 44.8,
  TDH3380B: 45.2,
  TDH3385B: 45.5,
  TDH3390B: 45.8,
  TDH3395B: 46.1,
  TDH3400B: 46.4,
  TDH3405B: 46.8,
  TDH3410B: 47.1,
  TDH3415B: 47.4,
  TDH3420B: 47.7,
  TDH3425B: 48.0,
  TDH3430B: 48.3,
  TDH3435B: 48.6,
  TDH3440B: 48.8,
  TDH3445B: 49.1,
  TDH3450B: 49.4,
  TDH3455B: 49.7,
  TDH3460B: 50.0,
  TDH3465B: 50.2,
  TDH3470B: 50.5,
  TDH3475B: 50.8,
  TDH3480B: 51.0,
  TDH3485B: 51.3,
  TDH3490B: 51.6,
  TDH3495B: 51.8,
  TDH3500B: 52.1,
  TDH3505B: 52.3,
  TDH3510B: 52.6,
  TDH3515B: 52.8,
  TDH3520B: 53.0,
  TDH3525B: 53.3,
  TDH3530B: 53.5,
  TDH3535B: 53.7,
  TDH3540B: 54.0,
  TDH3545B: 54.2,
  TDH3550B: 54.4,
  TDH3555B: 54.6,
  TDH3560B: 54.8,
  TDH3565B: 55.1,
  TDH3570B: 55.3,
  TDH3575B: 55.5,
  TDH3580B: 55.7,
  TDH3585B: 55.9,
  TDH3590B: 56.1,
  TDH3595B: 56.3,
  TDH3600B: 56.4,
  TDH3605B: 56.6,
  TDH3610B: 56.8,
  TDH3615B: 57.0,
  TDH3620B: 57.2,
};

/** @type {Record<string, number>} */
export const THERMODRAIN_EFFICIENCY_AT_9_5 = { ...THERMODRAIN_ADDITIONAL_EFFICIENCIES };

for (const [manufacturer, model, efficiencyAt9_5LMin] of DWHR_REGRESSION_SPOT_CHECKS) {
  if (manufacturer === "ThermoDrain") {
    THERMODRAIN_EFFICIENCY_AT_9_5[model] = efficiencyAt9_5LMin;
  }
}

const modelIds = thermoDrainModelIds();
if (modelIds.length !== 83) {
  throw new Error(`Expected 83 ThermoDrain model ids, got ${modelIds.length}`);
}
for (const model of modelIds) {
  const eff = THERMODRAIN_EFFICIENCY_AT_9_5[model];
  if (eff == null || !Number.isFinite(eff) || eff === 0) {
    throw new Error(`Missing authoritative ThermoDrain efficiency for ${model}`);
  }
}
