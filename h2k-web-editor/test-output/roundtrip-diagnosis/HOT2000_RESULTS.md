# HOT2000 Desktop Manual Acceptance

| File | HOT2000 result | Notes |
|------|----------------|-------|
| 00-original-template.h2k | PASS | Known-good control |
| 01-parse-serialize-only.h2k | UNKNOWN | Structurally identical; formatting only |
| 02-template-patch-unchanged-model.h2k | UNKNOWN | Structurally identical |
| 03-strip-allresults-only.h2k | **LIKELY FAIL** | Removes entire AllResults (1281 nodes) |
| 04-compatibility-only.h2k | UNKNOWN | Structurally identical |
| 05-allresults-plus-compatibility.h2k | **LIKELY FAIL** | Same AllResults removal as 03 |
| 06-current-full-serializer.h2k | UNKNOWN | After fix: structurally identical (AllResults preserved) |
| 07-browser-equivalent-roundtrip.h2k | **EXPECTED PASS** | After fix: structurally identical to 00 |

## Root cause (isolated)

1. **`stripCalculationResults()`** removed `/HouseFile/AllResults` and `Program/Results/Tsv` — fixed by preserving them on HOT2000 export.
2. **`programStructureMatches()`** treated `Results/Tsv` as invalid and rebuilt Program on import — fixed.
3. **`renderAllForms()` on import** mutated House via passive UI defaults (leakageArea, ranks, HotWater attrs) — fixed by using `applyRoute()` only.
4. **`syncMailingFromClient()`** created empty `UnitNumber` nodes — fixed.
5. **`ensureWindowTightnessDefault()`** overwrote `1.86` → `1.860` — fixed.

Fresh SOC policy unchanged: Generate still uses worker-calculated results only, not template AllResults.
