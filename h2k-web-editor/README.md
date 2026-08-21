# H2K Web Component Editor prototype

This browser-only prototype uses the supplied HOT2000 11.13 `.h2k` file as a structural template. It parses the XML in the browser, lets you edit general inputs and create/edit/delete the envelope component types that exist in the supplied file, then serializes the model back to `.h2k`.

## Run

Open `index.html` in a modern desktop browser. No server and no internet connection are required. Use **New empty model** to clear the envelope while retaining the HOT2000 template structure and code library, or import an existing `.h2k` for round-trip editing.

## Component workflow included

- Above-grade walls
- Windows nested under walls or basements
- Doors nested under walls or basements
- Floor headers nested under walls or basements
- Ceilings
- Exposed floors
- Basement/foundation components
- Project/client and weather fields
- House area, temperatures and blower-door fields
- Room ventilation and primary HRV fields
- Furnace fields from the supplied model
- Domestic hot water fields from the supplied model

Construction dropdowns are read directly from the `<Codes>` library in the active H2K document. New components are cloned from valid component structures already present in the supplied HOT2000 file, and new numeric component IDs are assigned automatically.

## Important limitation

This is a round-trip editor, not a replacement for the HOT2000 calculation engine or report printer. `AllResults` and other program-generated result data are preserved from the source template and can become stale after edits.

### Permit / submission house reports

**Official Full House Reports for permit or authority submission must be generated in HOT2000 Desktop only.**

Path in HOT2000 Desktop:

1. Open the calculated `.h2k`
2. **Report → Full house report → House with standard operating conditions**
3. Print / save that Desktop PDF for the permit package

This web editor cannot produce a report with the exact HOT2000 Desktop wording, paging, and schedules that authorities accept. Do not submit any web-generated PDF in place of the Desktop report.

### Review → Net GJ/a (optional check)

On the **Review** step:

1. **Validate** the house file (no blocking errors). A successful Validate click unlocks **Export HOT2000 .h2k**.
2. **Export .h2k** and recalculate in HOT2000 Desktop if SOC is missing or stale, then re-import if you want on-screen checks here.
3. **Generate Net (GJ/a)** (optional) when validation has passed and SOC exists — quick on-screen check only, not a permit report.
4. Print the **official** Full House Report from HOT2000 Desktop for submissions.

Only equipment/component XML structures present in the supplied template can be safely cloned by this prototype. For example, the supplied file contains a furnace and HRV, but not every possible HOT2000 heat-pump, boiler, cooling, crawlspace, slab, or renewable-system configuration. To add those safely, provide sample `.h2k` files containing those component types so their exact XML structures can be incorporated as additional prototypes.
