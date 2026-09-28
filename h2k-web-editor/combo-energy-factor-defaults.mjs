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
 */
export const COMBO_ENERGY_FACTOR_DEFAULTS = {
  /** Natural gas */
  "2": {
    "3": { "1": 0.56, "2": 0.6, "3": 0.6, "4": 0.61, "5": 0.82 },
    "4": { "1": 0.54, "2": 0.59, "3": 0.6, "4": 0.59, "5": 0.8 },
    "5": { "1": 0.51, "2": 0.58, "3": 0.6, "4": 0.57, "5": 0.77 },
    "6": { "1": 0.48, "2": 0.57, "3": 0.6 },
  },
  /** Oil — no authoritative combo EF table in this repository yet. */
  "3": {},
  /** Propane — no authoritative combo EF table in this repository yet. */
  "4": {},
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
