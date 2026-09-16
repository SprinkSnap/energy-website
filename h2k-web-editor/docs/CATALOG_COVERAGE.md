# HOT2000 Catalog Coverage (v2.0.0)

Pinned target: **HOT2000 11.13** (see `catalog/manifest.json` and `template.h2k`).

## Architecture

| Component | Role |
|-----------|------|
| `catalog/sections/*.json` | Section definitions (fields, conditions, behaviors) |
| `catalog/options/*.json` | Reusable dropdown/option packs — never hard-coded in renderer |
| `catalog/capture/hot2000-11.13/` | Desktop UI capture data (source of truth for field inventory) |
| `catalog/differential/` | Verified before/after `.h2k` mappings |
| `catalog/schema.json` | JSON Schema for catalog definitions |
| `catalog/import-pipeline.mjs` | Import, merge, and coverage validation |
| `h2k-schema-renderer.js` | Generic control renderer (text, number, date, checkbox, radio, coded-select, searchable-select, readonly, repeater, dialog, custom) |
| `h2k-catalog.js` | Catalog loader, behavior engine, section orchestration |

## Verified vs unverified

| Status | Meaning |
|--------|---------|
| **catalog-driven** | Section renders from `catalog/sections/*.json` through `H2kSchemaRenderer` |
| **legacy-inline** | Section still uses inline `render*Tab()` / `render*Screen()` in `app.js` (must be allowlisted) |
| **unverified** | Definition from capture, app extraction, or H2K samples; Desktop equivalence not confirmed |

**Do not mark anything `verified`** unless supported by controlled Desktop capture and/or differential `.h2k` evidence.

## Section migration status

| Section | Migration | Verification | Notes |
|---------|-----------|--------------|-------|
| **weather** | catalog-driven | unverified | Searchable location, region dependency, HDD side effects |
| **general** | catalog-driven | unverified | File ID, ownership, evaluator, client, mailing address custom block |
| **tightness** | catalog-driven | unverified | CSA classes with leakage auto-fill; user-specified enables value field |
| info | legacy-inline (allowlisted) | unverified | Repeatable rows — needs custom renderer |
| specifications | legacy-inline (allowlisted) | unverified | Conditional fields, unit conversion |
| fuel | legacy-inline (allowlisted) | unverified | Block rates |
| codes | catalog-driven | unverified | Read-only construction code summary (ID, Label, Value, Description, idref) |
| temperatures | catalog-driven | unverified | Main floors, basement, sizing design, crawl space setpoints |
| base-loads | catalog-driven | unverified | Occupancy, water usage, electrical usage tabs |
| **base-loads-water** | catalog-driven | unverified | Water Usage tab (hot/cold water fixtures and appliances) |
| generation | catalog-driven | unverified | PV editor shell with other generation options |
| **generation-power** | catalog-driven | unverified | Power Generation PV count, tabs, array, module, and losses |
| natural-air-infiltration | catalog-driven | unverified | Specifications tab editor shell with Other Factors tab |
| **natural-air-infiltration-specifications** | catalog-driven | unverified | House, blower test, building site, shielding, exhaust test |
| **natural-air-infiltration-other-factors** | catalog-driven | unverified | Weather station terrain, anemometer height, leakage fractions |
| ventilation | catalog-driven | unverified | Whole-house system tab editor shell with components tabs |
| **ventilation-whole-house-system** | catalog-driven | unverified | Requirements, room inputs, system description, temperature control, depressurization |
| **ventilation-whole-house-components** | catalog-driven | unverified | Eight ventilator rows, flow totals, and type-specific detail dialogs |
| heating-cooling | catalog-driven | unverified | Main tab editor shell with season, type, radiant, and supplementary tabs |
| **heating-cooling-system-main** | catalog-driven | unverified | Type 1/Type 2 system selection and optional features |
| **heating-cooling-system-season** | catalog-driven | unverified | Cooling season start, end, and design months |
| **heating-cooling-system-fans-pumps** | catalog-driven | unverified | Heating and cooling system fan or pump settings |
| **heating-cooling-system-baseboards** | catalog-driven | unverified | Baseboard/hydronic/plenum Type 1 specifications and equipment |
| domestic-hot-water | catalog-driven | unverified | Primary and secondary tab editor shell |
| **domestic-hot-water-primary** | catalog-driven | unverified | Primary tank, fuel, efficiency, equipment, and tank/flue fields |
| program | legacy-inline (allowlisted) | unverified | Conditional on program mode |
| envelope-components | legacy-inline (allowlisted) | unverified | Repeatable component editors |

## Coverage checks

Run automated coverage validation:

```bash
npm run test:h2k:catalog
# or
node h2k-web-editor/catalog/import-pipeline.mjs --check-coverage
```

Checks fail when:
- A captured HOT2000 field is missing from catalog
- A dropdown option is missing or lacks its HOT2000 code
- An XML mapping path is invalid
- A catalog definition references a missing `optionsRef`
- A section remains `legacy-inline` without allowlist entry
- A field is marked `verified` without evidence

## Import pipeline

```bash
# Regenerate stubs from app.js (unverified)
node h2k-web-editor/catalog/extract-from-app.mjs

# Merge Desktop capture into catalog JSON
node h2k-web-editor/catalog/import-pipeline.mjs --from-capture

# Full validation report
node h2k-web-editor/catalog/import-pipeline.mjs --check-coverage
```

## Responsive verification targets

Test catalog-driven sections at **320, 390, 768, 820, 1024, 1280** CSS px:
- One column by default; 12-column grid from 768px
- Minimum 44px touch targets
- No horizontal scrolling at 320px
- Searchable selects use full-width list (fixed panel at 320px)
