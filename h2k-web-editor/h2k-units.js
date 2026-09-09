/**
 * HOT2000 unit conversion helpers.
 * Conversions are applied only where import/export logic proves editor and H2K differ.
 */
(function initH2kUnits(global) {
  const LS_TO_CFM = 2.118879972;

  function num(v, d = 4) {
    const n = Number(v);
    return Number.isFinite(n) ? Number(n.toFixed(d)) : 0;
  }

  function feetToMetres(ft) {
    return num(ft / 3.280839895, 5);
  }

  function metresToFeet(m) {
    return num(m * 3.280839895, 3);
  }

  function squareFeetToSquareMetres(ft2) {
    return num(ft2 / 10.7639104167, 4);
  }

  function squareMetresToSquareFeet(m2) {
    return num(m2 * 10.7639104167, 3);
  }

  function cubicFeetToCubicMetres(ft3) {
    return num(ft3 / 35.3146667215, 4);
  }

  function cubicMetresToCubicFeet(m3) {
    return num(m3 * 35.3146667215, 3);
  }

  function inchesToMillimetres(inches) {
    return num(inches * 25.4, 4);
  }

  function millimetresToInches(mm) {
    return num(mm / 25.4, 3);
  }

  function fahrenheitToCelsius(f) {
    return num((f - 32) * 5 / 9, 4);
  }

  function celsiusToFahrenheit(c) {
    return num(c * 9 / 5 + 32, 2);
  }

  function litresPerSecondToCfm(ls) {
    return num(ls * LS_TO_CFM, 4);
  }

  function cfmToLitresPerSecond(cfm) {
    return num(cfm / LS_TO_CFM, 4);
  }

  function imperialGallonsToLitres(impGal) {
    return num(impGal * 4.54609, 4);
  }

  function litresToImperialGallons(l) {
    return num(l / 4.54609, 3);
  }

  function rValueToRsi(r) {
    return num(r * 0.1761101838, 4);
  }

  function rsiToRValue(rsi) {
    return num(rsi / 0.1761101838, 3);
  }

  function percentToDecimal(pct) {
    return num(pct / 100, 4);
  }

  function decimalToPercent(dec) {
    return num(dec * 100, 2);
  }

  /**
   * Mirror editor display conversions (fromSI / toSI) for tests and serializer audits.
   */
  function fromSI(value, measure, unitMode = "imperial") {
    if (value === "" || value == null) return "";
    let n = Number(value);
    if (!Number.isFinite(n)) return value;
    if (measure === "fahrenheit") return celsiusToFahrenheit(n);
    if (measure === "anemometer-height-ft") return metresToFeet(n);
    if (measure === "ela-imperial") return num(unitMode === "imperial" ? n / 6.4516 : n, 1);
    if (measure === "ela") return num(n, 1);
    if (measure === "vent-flow-rate" && unitMode === "imperial") return num(n * LS_TO_CFM, 1);
    if (measure === "vent-flow-cfm") return litresPerSecondToCfm(n);
    if (measure === "duct-length-ft") return metresToFeet(n);
    if (measure === "duct-diameter-in") return Math.round(n / 25.4);
    if (measure === "duct-insulation-r") return num(n, 5);
    if (!measure || unitMode !== "imperial") return n;
    if (measure === "area") return squareMetresToSquareFeet(n);
    if (measure === "volume") return cubicMetresToCubicFeet(n);
    if (measure === "length") return metresToFeet(n);
    if (measure === "mm") return millimetresToInches(n);
    if (measure === "door") return num(n * 39.37007874, 3);
    if (measure === "imp-gal-day" || measure === "imp-gal" || measure === "imp-gal-occ-day") {
      return litresToImperialGallons(n);
    }
    return num(n, 3);
  }

  function toSI(value, measure, unitMode = "imperial") {
    let n = Number(value);
    if (!Number.isFinite(n)) return value;
    if (measure === "fahrenheit") return fahrenheitToCelsius(n);
    if (measure === "anemometer-height-ft") return feetToMetres(n);
    if (measure === "ela-imperial") return num(unitMode === "imperial" ? n * 6.4516 : n, 4);
    if (measure === "ela") return num(n, 4);
    if (measure === "vent-flow-rate" && unitMode === "imperial") return cfmToLitresPerSecond(n);
    if (measure === "vent-flow-cfm") return cfmToLitresPerSecond(n);
    if (measure === "duct-length-ft") return feetToMetres(n);
    if (measure === "duct-diameter-in") return inchesToMillimetres(n);
    if (measure === "duct-insulation-r") return num(n, 5);
    if (unitMode !== "imperial") return n;
    if (measure === "area") return squareFeetToSquareMetres(n);
    if (measure === "volume") return cubicFeetToCubicMetres(n);
    if (measure === "length") return feetToMetres(n);
    if (measure === "mm") return inchesToMillimetres(n);
    if (measure === "door") return num(n / 39.37007874, 4);
    if (measure === "imp-gal-day" || measure === "imp-gal" || measure === "imp-gal-occ-day") {
      return imperialGallonsToLitres(n);
    }
    return num(n, 4);
  }

  global.H2kUnits = {
    LS_TO_CFM,
    num,
    feetToMetres,
    metresToFeet,
    squareFeetToSquareMetres,
    squareMetresToSquareFeet,
    cubicFeetToCubicMetres,
    cubicMetresToCubicFeet,
    inchesToMillimetres,
    millimetresToInches,
    fahrenheitToCelsius,
    celsiusToFahrenheit,
    litresPerSecondToCfm,
    cfmToLitresPerSecond,
    imperialGallonsToLitres,
    litresToImperialGallons,
    rValueToRsi,
    rsiToRValue,
    percentToDecimal,
    decimalToPercent,
    fromSI,
    toSI,
  };
})(typeof window !== "undefined" ? window : globalThis);
