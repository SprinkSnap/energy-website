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
| temperatures | legacy-inline (allowlisted) | unverified | |
| base-loads | legacy-inline (allowlisted) | unverified | |
| generation | legacy-inline (allowlisted) | unverified | Tabbed PV editor |
| natural-air-infiltration | legacy-inline (allowlisted) | unverified | Mode switching |
| ventilation | legacy-inline (allowlisted) | unverified | Detail dialogs |
| heating-cooling | legacy-inline (allowlisted) | unverified | Largest systems screen |
| domestic-hot-water | legacy-inline (allowlisted) | unverified | Fuel-dependent options |
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
