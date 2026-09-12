# HOT2000 Catalog Coverage (v1.0.0)

Pinned target: **HOT2000 11.13** (see `catalog/manifest.json` and `template.h2k`).

## Verified vs unverified

| Status | Meaning |
|--------|---------|
| **catalog-driven** | Section renders from `catalog/sections/*.json` through `H2kCatalog.renderSection()` |
| **legacy-inline** | Section still uses inline `render*Tab()` / `render*Screen()` functions in `app.js` |
| **unverified** | Definition extracted from the website or H2K samples; Desktop equivalence not yet confirmed |

**Do not claim complete Desktop equivalence** until the checks listed under each section pass.

## Section migration status

| Section | Migration | Verification | Notes |
|---------|-----------|--------------|-------|
| **weather** | catalog-driven | unverified | First migrated section; region → location dependency; searchable location list |
| general | legacy-inline | unverified | Stub extracted from `renderGeneralTab` |
| info | legacy-inline | unverified | Repeatable rows — needs custom renderer |
| specifications | legacy-inline | unverified | Conditional fields, unit conversion |
| tightness | legacy-inline | unverified | |
| fuel | legacy-inline | unverified | Block rates |
| codes | legacy-inline | unverified | Read-only code library summary |
| temperatures | legacy-inline | unverified | |
| base-loads | legacy-inline | unverified | |
| generation | legacy-inline | unverified | Tabbed PV editor |
| natural-air-infiltration | legacy-inline | unverified | Mode switching |
| ventilation | legacy-inline | unverified | Detail dialogs |
| heating-cooling | legacy-inline | unverified | Largest systems screen |
| domestic-hot-water | legacy-inline | unverified | Fuel-dependent options |
| program | legacy-inline | unverified | Conditional on program mode |
| envelope-components | legacy-inline | unverified | Repeatable component editors |

## Weather section — pending Desktop checks

1. Field labels and order on Weather screen
2. Region dropdown disabled when synced from client province (General tab)
3. Location list contents and order per region (regions 1–5 present in website; **6–13 missing**)
4. HDD auto-fill when location changes
5. Saved XML values for Region, Location, `@heatingDegreeDay`, `@depthOfFrost`, `@library`
6. Calculation result after worker submit for a fixture station

## Unresolved rules (open)

See `catalog/manifest.json` → `unresolvedRules`:

- **weather-locations-regions-6-13** — location lists for QC and Atlantic/Northern regions not in current website code
- **weather-region-sync** — region follows client province; Desktop disabled-state needs verification
- **weather-hdd-side-effect** — HDD from catalog record vs Desktop save

## Option catalogs extracted (all unverified)

`ownership`, `owner-occupied`, `house-types`, `plan-shapes`, `storeys`, `dirs`, `window-tightness`, `fuels`, `thermal-mass`, `soil`, `water-level`, `colours`, `weather-regions`, `weather-locations`

Regenerate stubs: `node h2k-web-editor/catalog/extract-from-app.mjs`

## Responsive verification targets

Test at **320, 390, 768, 820, 1024, 1280** CSS px (portrait/landscape, touch + keyboard, browser zoom). Weather location combo uses 44px touch targets and searchable long lists.

## Remote work

- Browser session auto-save (`sessionStorage`) with revision metadata
- Toolbar **Saved / Unsaved export / Recovered** status via `project-state.js`
- Import conflict prompt when local edits differ from last export
- Worker jobs accept `model_revision` + `editor_revision` + immutable `sourceHash` (SHA-256 of submitted XML)
- Net GJ/a and Full House Report marked stale after model edits (existing behavior)
