/**
 * HOT2000 Combo Heating/DHW default Energy Factor lookup.
 * Source: Natural gas values confirmed from HOT2000 11.13 screenshots (2026).
 *
 * Keys use HOT2000 XML @code values:
 * - energySource: Equipment/EnergySource (@code 2=Natural gas, 3=Oil, 4=Propane)
 * - equipmentType: Equipment/EquipmentType @code
 * - tankVolume: ComboTankAndPump/TankCapacity @code (preset) or litres match for code 1
 */

/** Preset tank capacity codes → litres (code 1 = user specified). */
export const COMBO_EF_TANK_VOLUME_LITRES = {
  "2": 113.6,
  "3": 151.4,
  "4": 189.3,
  "5": 246.1,
  "6": 302.8,
};

/**
 * Default energy factors by fuel → tank code → equipment type code.
 * Only explicitly verified cells are populated; do not interpolate.
 * Natural gas tank codes 3–6 verified from HOT2000 11.13 screenshots (2026).
 * Oil tank codes 2–6 (113.6 L through 302.8 L) verified from HOT2000 screenshots (2026).
 * Natural gas tank code 2 (113.6 L) has no verified EF table.
 * Propane tank codes 2–5 (113.6 L through 246.1 L) verified from HOT2000 screenshots (2026).
 * Propane tank code 6 (302.8 L) has no verified EF table.
 */
export const COMBO_ENERGY_FACTOR_DEFAULTS = {
  /** Natural gas */
  "2": {
    "3": { "1": 0.56, "2": 0.6, "3": 0.6, "4": 0.61, "5": 0.82 },
    "4": { "1": 0.54, "2": 0.59, "3": 0.6, "4": 0.59, "5": 0.8 },
    "5": { "1": 0.51, "2": 0.58, "3": 0.6, "4": 0.57, "5": 0.77 },
    "6": { "1": 0.48, "2": 0.57, "3": 0.6, "4": 0.55, "5": 0.74 },
  },
  /** Oil — equipment codes 2,3,4,6,5 match COMBO_EQUIP_OIL */
  "3": {
    "2": { "2": 0.56, "3": 0.58, "4": 0.6, "6": 0.61, "5": 0.74 },
    "3": { "2": 0.55, "3": 0.57, "4": 0.59, "6": 0.6, "5": 0.72 },
    "4": { "2": 0.54, "3": 0.56, "4": 0.58, "6": 0.59, "5": 0.7 },
    "5": { "2": 0.52, "3": 0.54, "4": 0.55, "6": 0.56, "5": 0.68 },
    "6": { "2": 0.5, "3": 0.52, "4": 0.53, "6": 0.54, "5": 0.65 },
  },
  /** Propane — equipment codes 1–5 match COMBO_EQUIP_GAS */
  "4": {
    "2": { "1": 0.58, "2": 0.61, "3": 0.6, "4": 0.63, "5": 0.84 },
    "3": { "1": 0.56, "2": 0.6, "3": 0.6, "4": 0.61, "5": 0.82 },
    "4": { "1": 0.54, "2": 0.59, "3": 0.6, "4": 0.59, "5": 0.8 },
    "5": { "1": 0.51, "2": 0.58, "3": 0.6, "4": 0.57, "5": 0.77 },
  },
};

const LITRE_MATCH_TOLERANCE = 0.05;

/**
 * @param {{ energySource: string, equipmentType: string, tankVolume?: string, tankVolumeCode?: string, tankVolumeLitres?: number }} params
 * @returns {number | null}
 */
export function getComboEnergyFactorDefault(params) {
  const fuel = String(params?.energySource ?? "");
  const equip = String(params?.equipmentType ?? "");
  const tankCodeRaw =
    params?.tankVolume != null
      ? String(params.tankVolume)
      : params?.tankVolumeCode != null
        ? String(params.tankVolumeCode)
        : "";

  let tankKey = tankCodeRaw;
  if (tankKey === "1" || tankKey === "") {
    const litres = Number(params?.tankVolumeLitres);
    if (!Number.isFinite(litres)) return null;
    const preset = Object.entries(COMBO_EF_TANK_VOLUME_LITRES).find(
      ([, l]) => Math.abs(l - litres) <= LITRE_MATCH_TOLERANCE,
    );
    if (!preset) return null;
    tankKey = preset[0];
  }

  const byFuel = COMBO_ENERGY_FACTOR_DEFAULTS[fuel];
  if (!byFuel) return null;
  const byTank = byFuel[tankKey];
  if (!byTank) return null;
  const value = byTank[equip];
  return value != null && Number.isFinite(Number(value)) ? Number(value) : null;
}

/** @returns {string} */
export function formatComboEnergyFactorDefault(value) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(2);
}

if (typeof globalThis !== "undefined") {
  globalThis.ComboEnergyFactorDefaults = {
    COMBO_ENERGY_FACTOR_DEFAULTS,
    COMBO_EF_TANK_VOLUME_LITRES,
    getComboEnergyFactorDefault,
    formatComboEnergyFactorDefault,
  };
}
