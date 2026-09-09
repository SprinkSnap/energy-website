# H2K Round-Trip Diagnosis Summary

Generated: 2026-09-09T15:29:46.082Z

## Files Created

- `00-original-template.h2k`
- `01-parse-serialize-only.h2k`
- `01-parse-serialize-only.diff.json`
- `02-template-patch-unchanged-model.h2k`
- `02-template-patch-unchanged-model.diff.json`
- `03-strip-allresults-only.h2k`
- `03-strip-allresults-only.diff.json`
- `04-compatibility-only.h2k`
- `04-compatibility-only.diff.json`
- `05-allresults-plus-compatibility.h2k`
- `05-allresults-plus-compatibility.diff.json`
- `06-current-full-serializer.h2k`
- `06-current-full-serializer.diff.json`
- `07-browser-equivalent-roundtrip.h2k`
- `07-browser-equivalent-roundtrip.diff.json`
- `validation-snapshots.json`
- `validation-snapshots.diff.json`
- `HOT2000_RESULTS.md`

## Transformations (01–07)

| File | Transformation |
|------|----------------|
| 00-original-template.h2k | Exact byte copy of template.h2k |
| 01-parse-serialize-only.h2k | DOMParser → XMLSerializer only |
| 02-template-patch-unchanged-model.h2k | patchEditorValuesIntoTemplate only |
| 03-strip-allresults-only.h2k | stripCalculationResults only |
| 04-compatibility-only.h2k | applyHot2000DesktopCompatibility only |
| 05-allresults-plus-compatibility.h2k | stripCalculationResults + applyHot2000DesktopCompatibility |
| 06-current-full-serializer.h2k | serializeModelUsingTemplate({ forHot2000: true }) |
| 07-browser-equivalent-roundtrip.h2k | Full browser import → Validate → Export path |

## Subtree Hash Differences (vs original)

### 01
- No subtree hash changes

### 02
- No subtree hash changes

### 03
- Changed sections: AllResults, Program

### 04
- No subtree hash changes

### 05
- Changed sections: AllResults, Program

### 06
- No subtree hash changes

### 07
- No subtree hash changes

## Structural Change Counts (vs original)

| File | Attrs | Text | Added | Removed | Reordered |
|------|-------|------|-------|---------|-----------|
| 01 | 0 | 0 | 0 | 0 | 0 |
| 02 | 0 | 0 | 0 | 0 | 0 |
| 03 | 0 | 0 | 0 | 1281 | 2 |
| 04 | 0 | 0 | 0 | 0 | 0 |
| 05 | 0 | 0 | 0 | 1281 | 2 |
| 06 | 0 | 0 | 0 | 0 | 0 |
| 07 | 0 | 0 | 0 | 0 | 0 |

## Encoding / Declaration Differences

- **01**: declaration or BOM differs
  - original: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\" ?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
  - generated: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\"?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
- **02**: declaration or BOM differs
  - original: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\" ?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
  - generated: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\"?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
- **03**: declaration or BOM differs
  - original: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\" ?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
  - generated: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\"?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
- **04**: declaration or BOM differs
  - original: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\" ?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
  - generated: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\"?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
- **05**: declaration or BOM differs
  - original: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\" ?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
  - generated: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\"?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
- **06**: declaration or BOM differs
  - original: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\" ?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
  - generated: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\"?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
- **07**: declaration or BOM differs
  - original: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\" ?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}
  - generated: {"declaration":"<?xml version=\"1.0\" encoding=\"UTF-8\"?>","hasBom":false,"encoding":"UTF-8","startsWithXmlDecl":true}

## Strongest Evidence-Backed Suspects (pre-HOT2000 manual test)

Pending HOT2000 Desktop PASS/FAIL on files 01–06. See `HOT2000_RESULTS.md`.

Automated observations from this run:
- **01**: 1298 raw text line(s) differ
- **02**: 1298 raw text line(s) differ
- **03**: AllResults subtree removed; 1769 raw text line(s) differ
- **04**: 1298 raw text line(s) differ
- **05**: AllResults subtree removed; 1769 raw text line(s) differ
- **06**: 1298 raw text line(s) differ
- **07**: 1303 raw text line(s) differ