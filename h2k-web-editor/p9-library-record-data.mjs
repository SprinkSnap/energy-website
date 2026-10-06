/**
 * Authoritative P9 Library record payloads (performance + test data).
 * Canonical storage: watts for power fields, litres for one-hour ratings.
 */
const P9_WATTS_TO_BTU_HR = 3.412141633;
const P9_IMP_GAL_TO_LITRES = 4.54609;

function btuHrToWatts(btuHr) {
  return Number(btuHr) / P9_WATTS_TO_BTU_HR;
}

function impGalToLitres(gal) {
  return Number(gal) * P9_IMP_GAL_TO_LITRES;
}

function rinnaiTestData({
  net15,
  net40,
  net100,
  elec15,
  elec40,
  elec100,
  blower15,
  blower40,
  blower100,
  dailyUse,
  dhwGal,
  concurrentGal,
}) {
  return {
    energySource: "2",
    netEfficiency: { loadPerformance15: net15, loadPerformance40: net40, loadPerformance100: net100 },
    electricalUse: { loadPerformance15: elec15, loadPerformance40: elec40, loadPerformance100: elec100 },
    blowerPower: { loadPerformance15: blower15, loadPerformance40: blower40, loadPerformance100: blower100 },
    controlsPower: 12,
    circulationPower: 73,
    dailyUse,
    standbyLossWithFan: 0,
    standbyLossWithoutFan: 0,
    oneHourRatingHotWater: impGalToLitres(dhwGal),
    oneHourRatingConcurrent: impGalToLitres(concurrentGal),
  };
}

/** @type {Record<string, object>} */
export const P9_LIBRARY_RECORD_DATA_BY_ID = {
  "rinnai-cah050e-01": {
    thermalPerformanceFactor: 0.89,
    annualElectricity: 3935,
    spaceHeatingCapacity: btuHrToWatts(53229.4),
    spaceHeatingEfficiency: 89,
    waterHeatingPerformanceFactor: 0.94,
    burnerInput: btuHrToWatts(198928),
    recoveryEfficiency: 96,
    testData: rinnaiTestData({
      net15: 81,
      net40: 92,
      net100: 90,
      elec15: 293,
      elec40: 811,
      elec100: 1057,
      blower15: 436,
      blower40: 720,
      blower100: 859,
      dailyUse: 0.27,
      dhwGal: 298.718,
      concurrentGal: 299.158,
    }),
  },
  "rinnai-cah050e-02": {
    thermalPerformanceFactor: 0.88,
    annualElectricity: 1623,
    spaceHeatingCapacity: btuHrToWatts(51864.5),
    spaceHeatingEfficiency: 87,
    waterHeatingPerformanceFactor: 0.95,
    burnerInput: btuHrToWatts(160371),
    recoveryEfficiency: 98,
    testData: rinnaiTestData({
      net15: 83,
      net40: 89,
      net100: 88,
      elec15: 157,
      elec40: 246,
      elec100: 673,
      blower15: 195,
      blower40: 198,
      blower100: 503,
      dailyUse: 0.3,
      dhwGal: 241.086,
      concurrentGal: 241.966,
    }),
  },
};

/** @type {Record<string, string>} */
export const P9_LEGACY_LIBRARY_RECORD_ID_ALIASES = {
  "rinnai-cah050e-1": "rinnai-cah050e-01",
  "rinnai-cah050e-2": "rinnai-cah050e-02",
};
