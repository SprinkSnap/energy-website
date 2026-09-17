# H2K Field Mapping Inventory

Authoritative HOT2000 structure: `template.h2k`.  
Editor model: live `xmlDoc` with XPath bindings (`data-xml-path` or component form `name` → save handler).

**Status legend**

| Status | Meaning |
|---|---|
| mapped | Editor reads/writes this XPath symmetrically |
| derived | Computed in UI, written on save |
| template-preserved | Not editor-controlled; kept from template on export |
| unsupported | No proven HOT2000 mapping; template value preserved |

**Serializer entry:** `H2KSerializer.buildH2kFromTemplate(editorDoc, templateXml)`  
**Export wrapper:** `serializeForExport()` in `app.js`

---

## ProgramInformation — General

| Editor field | Model property (XPath) | HOT2000 XPath | XML target | Units | Code/ID rules | Status |
|---|---|---|---|---|---|---|
| File ID | `/HouseFile/ProgramInformation/File/Identification` | `ProgramInformation/File/Identification` | text | — | — | mapped |
| Prev. File ID | `.../PreviousFileId` | same | text | — | — | mapped |
| House ID | `.../EnrollmentId` | same | text | — | — | mapped |
| Application Identifier | `.../ApplicationNumber` | same | text | — | — | mapped |
| Homeowner Authorization ID | `.../HomeownerAuthorizationId` | same | text | — | — | mapped |
| Evaluation Date | `.../File/@evaluationDate` | `File/@evaluationDate` | attribute | ISO date | — | mapped |
| Ownership | `.../Ownership` | `Ownership` | `@code` + English/French | — | code from OWNERSHIP dict | mapped |
| Property Tax Roll # | `.../TaxNumber` | same | text | — | — | mapped |
| Owner Occupied | `.../OwnerOccupied` | same | `@code` + labels | — | coded | mapped |
| Builder Name | `.../BuilderName` | same | text (max 32) | — | — | mapped |
| Entered by | `.../EnteredBy` | same | text | — | — | mapped |
| User phone/ext | `.../UserTelephone`, `UserExtension` | same | text | — | — | mapped |
| Company / phone | `.../Company`, `CompanyTelephone`, `CompanyExtension` | same | text | — | — | mapped |
| Client telephone | `.../Client/Telephone` | same | text | — | — | mapped |
| Street address | `CLIENT_STREET/*` | `Client/StreetAddress/*` | text | — | — | mapped |
| Mailing address | `CLIENT_MAIL/*` | `Client/MailingAddress/*` | text | — | — | mapped |
| Mixed Use | `.../@mixed` | `@mixed` | attribute bool | — | — | mapped |

---

## ProgramInformation — Weather

| Editor field | XPath | XML target | Units | Conversion | Status |
|---|---|---|---|---|---|
| Region | `Weather/Region` | `@code` + English/French | — | — | mapped |
| Location | `Weather/Location` | `@code` + English | — | — | mapped |
| HDD | `Weather/@heatingDegreeDay` | attribute | °C-days | — | mapped (often disabled) |
| Frost depth | `Weather/@depthOfFrost` | attribute | m | display ft in imperial | mapped |
| Library | `Weather/@library` | attribute | — | — | template-preserved |

---

## House — Specifications

| Editor field | XPath | XML target | Units | Code/ID | Status |
|---|---|---|---|---|---|
| Building type | `Specifications/@buildingType` | attribute | — | House/Building | mapped |
| House type | `Specifications/HouseType` | `@code` + labels | — | template codes | mapped |
| Plan shape | `Specifications/PlanShape` | `@code` + labels | — | template codes | mapped |
| Storeys | `Specifications/Storeys` | `@code` + labels | — | template codes | mapped |
| Front orientation | `Specifications/FacingDirection` | `@code` + labels | — | template codes | mapped |
| Year built preset | `Specifications/YearBuilt` | `@code` | year enum | — | mapped |
| Year value | `Specifications/YearBuilt/@value` | attribute | year | — | mapped |
| Heated floor area | `HeatedFloorArea/@aboveGrade`, `@belowGrade` | attributes | m² | ft² display | mapped |
| Default roof cavity | `@defaultRoofCavity` | attribute | — | — | mapped |
| NBC eligible | `@eligibleForNBC` | attribute | — | — | mapped |
| Wall/roof colour | `WallColour`, `RoofColour` | `@code`, `@value` | absorptance | COLOURS dict | mapped |
| Thermal mass / soil / water | respective elements | `@code` + labels | — | template codes | mapped |

---

## Natural Air Infiltration

| Editor field | XPath | XML target | Units | Conversion | Status |
|---|---|---|---|---|---|
| House volume | `NaturalAirInfiltration/House/@volume` | attribute | m³ | ft³ display | mapped |
| ACH50 | `.../BlowerTest/@airChangeRate` | attribute | ACH | — | mapped |
| Leakage area | `.../BlowerTest/@leakageArea` | attribute | cm² or in² | ela conversion | mapped |
| Blower pressure | `.../BlowerTest/Pressure` | `@code` | Pa | — | mapped |
| Terrain / shielding | `Specifications/*` | coded elements | — | — | mapped |
| Leakage fractions | `Other/LeakageFractions/@ceilings` etc. | attributes | % | — | mapped |

---

## Ventilation

| Editor field | XPath | XML target | Units | Status |
|---|---|---|---|---|
| Use mode | `Ventilation/Requirements/Use` | `@code` | — | mapped |
| ACH requirement | `Requirements/@ach` | attribute | ACH | mapped |
| Supply / exhaust | `Requirements/@supply`, `@exhaust` | attribute | L/s | cfm in imperial | mapped |
| Whole-house HRV rows | `WholeHouseVentilatorList/*` | equipment subtree | clone prototype | mapped |
| Supplemental rows | `SupplementalVentilatorList/*` | equipment subtree | clone prototype | mapped |
| Duct fields | per-unit `ColdAirDucts/*` | attributes + coded children | ft/in/R | mapped |

---

## Heating / Cooling

| Editor field | XPath | XML target | Status |
|---|---|---|---|
| Cooling season start/end/design | `HeatingCooling/CoolingSeason/Start` etc. | `@code` + **text content** | mapped (text-content coded) |
| Type 1 system | `HeatingCooling/Type1/Furnace` (etc.) | equipment subtree | mapped |
| Type 2 system | `HeatingCooling/Type2/AirHeatPump` (etc.) | equipment subtree | mapped |
| Fans and pump | `Type1/FansAndPump/*` | attributes + coded | mapped |
| Supplementary heat | `SupplementaryHeatingSystems/System` | repeatable clone | mapped |

---

## Domestic Hot Water

| Editor field | XPath | XML target | Status |
|---|---|---|---|
| Primary DHW | `Components/HotWater/Primary/*` | full subtree | mapped |
| DWHR | `Primary/DrainWaterHeatRecovery/*` | subtree | mapped |
| Secondary | `Components/HotWater/Secondary` | subtree | template-preserved (no UI) |

---

## Base Loads

| Editor field | XPath | XML target | Status |
|---|---|---|---|
| Occupancy | `BaseLoads/Occupancy/*` | attributes | mapped |
| Water usage | `BaseLoads/WaterUsage/*` | mixed | mapped |
| Electrical usage | `BaseLoads/ElectricalUsage/*` | mixed | mapped |
| User specified flag | `BaseLoads/@userSpecifiedUsage` | attribute | mapped (stripped on HOT2000 export) |

---

## Generation (PV)

| Editor field | XPath | XML target | Status |
|---|---|---|---|
| PV count | `Generation/PhotovoltaicSystems/System` | repeatable | mapped |
| Capacity, array, module | per-system subtree | attributes + coded | mapped |
| Battery / wind flags | `Generation/@batteryStorage` etc. | attributes | mapped |

---

## Envelope Components

Components live under `/HouseFile/House/Components`. New items clone `template.h2k` prototypes via `prototype(type).cloneNode(true)`.

| Type | Parent XML | Editor ID | Construction ref | Status |
|---|---|---|---|---|
| Wall | `Components/Wall` | `@id` | `Construction/Type/@idref` → `Codes/Wall` | mapped |
| Window | `Components//Window` (under Wall/Basement/Door) | `@id` | `Construction/Type/@idref` → `Codes/Window` | mapped |
| Door | `Components//Door` | `@id` | `Construction/Type/@code` | mapped |
| Ceiling | `Components/Ceiling` | `@id` | `Construction/CeilingType/@idref` | mapped |
| Floor (exposed) | `Components/Floor` | `@id` | `Construction/Type/@idref` → `Codes/Floor` | mapped |
| Floor header | `Components//FloorHeader` | `@id` | `Construction/Type/@idref` → `Codes/FloorHeader` | mapped |
| Basement / foundation | `Components/Basement` | `@id` | `Configuration`, `Wall`, `Floor` subtrees | mapped (`foundation-insulation.js`) |

### Foundation (foundation-insulation.js)

| Form name | XML target | Status |
|---|---|---|
| `foundationConstruction` | `Configuration/@data-construction` | mapped |
| `foundationInsulation` | `Configuration/@data-insulation` | mapped |
| `floorLength`, `floorWidth`, `area` | `Floor/Measurements/@*` | mapped (m / ft²) |
| `wallHeight`, `depth` | `Wall/Measurements/@*` | mapped |
| `interiorInsulation` | `Wall/Construction/InteriorAddedInsulation/@idref` | mapped |
| `bwFraming`, layer fields | `Codes/BasementWall` user code | mapped |
| `floorsAbove`, `faStructure`, etc. | `Codes/FloorsAbove` user code | mapped |
| Composite sections | `Composite/Section[@rank]/@percentage`, `@nominalRsi` | mapped |

---

## Codes library

| Editor action | XPath | Strategy | Status |
|---|---|---|---|
| User wall code | `/HouseFile/Codes/Wall/UserDefined/Code` | clone or create with `id` | mapped |
| User window code | `/HouseFile/Codes/Window/UserDefined/Code` | clone prototype | mapped |
| Standard library codes | `/HouseFile/Codes/*/Standard/Code` | template-preserved | template-preserved |

---

## Program / Results (template-preserved calculated data)

| XPath | Editor control | Export behavior | Status |
|---|---|---|---|
| `Program/Results/Tsv/*` | none | preserved from editor or template | template-preserved |
| `Program/Results/RefHse/*` | none | preserved | template-preserved |
| `Program/Results/Ers/*` | none (read for display) | preserved on rebuild | template-preserved |
| `AllResults/Results[@houseCode=SOC]` | none | structure preserved; **not** used for Generate Net GJ/a | template-preserved |

---

## Fuel Costs

| Editor field | XPath | Notes | Status |
|---|---|---|---|
| Rate period | `FuelCosts/@ratePeriod` | web-only; stripped on export | mapped |
| Fuel labels | `FuelCosts/*/Fuel[1]/Label` | display | mapped |

---

## Window Tightness

| Editor field | XPath | XML target | Status |
|---|---|---|---|
| Tightness preset | `House/WindowTightness` | `@code` + labels | mapped |
| Leakage value | `House/WindowTightness/@value` | attribute L/s·m² | mapped |

---

## ID and reference strategy

- Component `@id`: numeric strings from template pattern; `assignIds()` on new components.
- `Construction/Type/@idref`: references `Codes/*/Code/@id` (e.g. `Code 2`).
- Duplicate IDs across `FuelCosts` vs `Components` are valid in HOT2000; validator checks duplicates only under `House/Components//*[@id]`.
- Cloning: `prototype(type)` deep-clones first matching template element.

---

## Unit conversion (H2kUnits)

| Measure | Editor display | HOT2000 storage | Helper |
|---|---|---|---|
| length | ft (imperial) | m | `toSI` / `fromSI` |
| area | ft² | m² | `squareFeetToSquareMetres` |
| volume | ft³ | m³ | `cubicFeetToCubicMetres` |
| temperature | °F | °C | `fahrenheitToCelsius` |
| vent flow | cfm | L/s | `cfmToLitresPerSecond` |
| R-value display | R | RSI in some codes | `rValueToRsi` |

---

## Unmapped / unsupported

| Field | Reason |
|---|---|
| `Program/Results/Tsv` field values | Read-only calculated data; never written by editor |
| Some secondary DHW fields | No UI |
| Greener Homes grant XML | Not in current editor scope |

---

## Regression tests

| Test file | Coverage |
|---|---|
| `test/h2k-serializer.test.mjs` | Round-trip, Tsv preservation, yearBuilt, ACH, units, validator |
| `test/generate-regression.mjs` | Generate uses `serializeForExport` |

Run: `npm run test:h2k`
