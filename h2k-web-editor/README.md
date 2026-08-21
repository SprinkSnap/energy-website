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

This is a round-trip editor, not a replacement for the HOT2000 calculation engine. `AllResults` and other program-generated result data are preserved from the source template and can become stale after edits.

### Review → Net GJ/a → PDF

On the **Review** step:

1. **Validate** the house file (no blocking errors). A successful Validate click unlocks **Export HOT2000 .h2k**.
2. **Export .h2k** and recalculate in HOT2000 Desktop if SOC is missing or stale, then re-import.
3. **Generate Net (GJ/a)** (enabled only when validation has passed and SOC exists).
4. **Full House Report (SOC)** (enabled only after Net GJ/a has been generated). Opens a HOT2000-style Full House Report for *House with standard operating conditions* (same report path as HOT2000 Desktop: Report → Full house report → SOC). Use the browser print dialog → **Save as PDF**. Values come from the calculated `.h2k`; some Desktop-only schedules may still differ.

Only equipment/component XML structures present in the supplied template can be safely cloned by this prototype. For example, the supplied file contains a furnace and HRV, but not every possible HOT2000 heat-pump, boiler, cooling, crawlspace, slab, or renewable-system configuration. To add those safely, provide sample `.h2k` files containing those component types so their exact XML structures can be incorporated as additional prototypes.
