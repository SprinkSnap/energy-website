# H2K Export Corruption Diagnosis

This document records the concrete root causes of HOT2000 rejecting exported `.h2k` files from the H2K Web Editor, with before/after examples from `template.h2k`.

## Summary

The editor already loaded `template.h2k` into an in-memory `xmlDoc`, but **in-place mutations during load and render** stripped or malformed required HOT2000 subtrees before export. Export then cloned the already-corrupted document.

The fix uses **template-based serialization on export** (`H2KSerializer.buildH2kFromTemplate`) plus corrections to the in-memory mutation bugs.

---

## Root Cause 1 — Program rebuild destroyed `Tsv` and `RefHse` (CRITICAL)

### Trigger

`loadDoc()` → `normalizeFieldLimits()` → `ensureProgramModeDefault()` → `setProgramMode()` when `programStructureMatches()` returned false.

### Bug

`programStructureMatches()` treated presence of `Program/Results/Tsv` as **invalid**:

```javascript
// BEFORE (wrong)
if (xp("/HouseFile/Program/Results/Tsv")) return false;
```

Calculated HOT2000 files (including `template.h2k`) always contain `Tsv` (~432 fields) and `RefHse`. The editor rebuilt `Program` with only `Ers`, dropping calculated metadata.

### XPath comparison

| XPath | TEMPLATE (valid) | BEFORE export (invalid) |
|---|---|---|
| `/HouseFile/Program/Results/Tsv` | 432 child nodes | **Missing** |
| `/HouseFile/Program/Results/Tsv/FloorArea/@value` | `"272.5"` | **Absent** |
| `/HouseFile/Program/Results/RefHse/theHouseFDWR/@value` | numeric string | **Missing `<RefHse>`** |

### Fix

1. Removed the `Tsv` rejection from `programStructureMatches()`.
2. `buildProgramResults()` now clones existing `Tsv` and `RefHse` when rebuilding `Program`.
3. `H2KSerializer.patchProgram()` merges editor `Program` while preserving `Tsv`/`RefHse` from editor or template.

---

## Root Cause 2 — `CoolingSeason` month nodes corrupted (HIGH)

### Trigger

Every render: `ensureHeatingDefaults()` → `applyCodedDefault()` on `CoolingSeason/Start`, `End`, `Design`.

### Bug

`template.h2k` stores month names as **direct text content**:

```xml
<Start code="1">January</Start>
```

`setCoded()` appended `<English>`/`<French>` children **without removing** the existing text node:

```xml
<!-- INVALID output -->
<Start code="1">January<English>January</English><French>janvier</French></Start>
```

### Fix

1. Added `TEXT_CONTENT_CODED_PATHS` for the three `CoolingSeason` month elements.
2. `setCoded()` clears text nodes and uses text content for those paths.
3. `applyCodedDefault()` skips when `@code` already matches (no redundant re-application).

---

## Root Cause 3 — `normalizeFieldLimits()` overwrote imported values (MEDIUM)

### Bug

Unconditional `applyCodedDefault()` on every load forced Ownership, YearBuilt, WallColour, WaterLevel, etc. to template defaults even when the imported file had different valid codes.

### Fix

Defaults apply **only when the coded element has no `@code`** yet.

---

## Root Cause 4 — `ensureEl()` bare skeleton nodes (MEDIUM)

`ensureEl()` creates empty elements without required attributes, labels, or children when a path is missing. Safe when the template already provides structure; dangerous for partial paths.

### Mitigation

- Export now starts from a fresh `template.h2k` parse and replaces only editor-controlled subtrees.
- Unknown or unmapped fields keep template values (preservation-first policy).

---

## Root Cause 5 — Export attribute stripping (LOW, intentional)

`buildXmlString({ forHot2000: true })` removes web-only attributes:

- `FuelCosts/@ratePeriod`
- `BaseLoads/@userSpecifiedUsage`
- `ClothesWasher|DishWasher|ClothesDryer/@installed`

These are not HOT2000 schema fields; stripping is correct.

---

## Root Cause 6 — XMLSerializer formatting (LOW)

Cosmetic differences (self-closing vs empty tags, declaration spacing) do not cause HOT2000 corruption.

---

## Canonical export path (after fix)

```
editor xmlDoc
  → syncProgramModeFromUI / fuel blocks
  → H2KSerializer.buildH2kFromTemplate(xmlDoc, template.h2k)
      → parse fresh template
      → patch ProgramInformation, House, Codes, FuelCosts from editor
      → merge Program (preserve Tsv/RefHse)
      → preserve AllResults structure from editor when present
      → validate
      → serialize
  → Export / Generate Net GJ/a / worker submission
```

**Generate Net GJ/a** uses the same `serializeForExport()` path — never template `AllResults` SOC values as the answer.
