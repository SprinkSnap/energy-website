/**
 * Extract SOC Net GJ/a from a calculated H2K file.
 *
 * Verified against template.h2k:
 *   /HouseFile/AllResults/Results[@houseCode='SOC']/Annual/Consumption/@total
 *
 * This matches the frontend `extractSocResults()` field `netGJa` which reads
 * `cons.getAttribute("total")` on the SOC Consumption node.
 */
export function extractSocNetGJa(xml: string): number | null {
  if (!/Results[^>]*houseCode\s*=\s*["']SOC["']/i.test(xml)) return null;

  const socBlock = matchSocConsumptionBlock(xml);
  if (!socBlock) return null;

  const totalMatch = /\btotal\s*=\s*["']([^"']+)["']/i.exec(socBlock);
  if (!totalMatch) return null;

  const value = Number(totalMatch[1]);
  return Number.isFinite(value) ? value : null;
}

function matchSocConsumptionBlock(xml: string): string | null {
  const socResultsRe =
    /<Results\b[^>]*\bhouseCode\s*=\s*["']SOC["'][^>]*>([\s\S]*?)<\/Results>/i;
  const socMatch = socResultsRe.exec(xml);
  if (!socMatch) return null;

  const annualRe = /<Annual\b[^>]*>([\s\S]*?)<\/Annual>/i;
  const annualMatch = annualRe.exec(socMatch[1]);
  if (!annualMatch) return null;

  const consumptionRe = /<Consumption\b[^>]*>([\s\S]*?)<\/Consumption>/i;
  const consumptionMatch = consumptionRe.exec(annualMatch[1]);
  if (!consumptionMatch) return null;

  const openTag = /<Consumption\b[^>]*>/i.exec(annualMatch[1]);
  return openTag ? openTag[0] : consumptionMatch[0];
}

export function assertParseableH2k(xml: string): void {
  const trimmed = xml.trim();
  if (!trimmed) {
    throw new Error("Uploaded file is empty.");
  }
  if (trimmed.length > 8 * 1024 * 1024) {
    throw new Error("Uploaded file exceeds the 8 MB limit.");
  }
  if (!/<\?xml/i.test(trimmed) && !/<HouseFile\b/i.test(trimmed)) {
    throw new Error("File does not look like an H2K XML document.");
  }
  if (!/<HouseFile\b/i.test(trimmed)) {
    throw new Error("Missing HouseFile root element.");
  }
  if (!/<House\b/i.test(trimmed)) {
    throw new Error("Missing House element in H2K file.");
  }
}
