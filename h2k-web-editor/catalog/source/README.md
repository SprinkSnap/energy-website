Place the authoritative workbook here (source only — **not read at runtime**):

`DWHR_Efficiency_Data_Entry(3).xlsx` (preferred)

Legacy fallback: `DWHR_Efficiency_Data_Entry(2).xlsx`

Sheet: **Model Catalog**

| Column A | Column B | Column C |
|----------|----------|----------|
| Manufacturer | Model | Efficiency at 9.5 L/min (%) |

Expected catalog facts (v3 workbook):

- **325** unique Manufacturer + Model rows
- **5** manufacturers
- ThermoDrain **83**, Ecodrain **15**, Power-Pipe **216**, Generic **3**, Watercycles Energy Recovery Inc. **8**
- Every row has a numeric Column C efficiency (0–100%, no blanks)

Generate the bundled catalog (committed static assets):

```bash
npm run import:dwhr-catalog
```

This writes:

- `h2k-web-editor/dwhr-model-catalog.generated.mjs` (loaded by the editor)
- `h2k-web-editor/data/dwhr-products.json` (same data, for review/diff)

Override workbook path: `DWHR_CATALOG_XLSX=/path/to/workbook.xlsx npm run import:dwhr-catalog`

If the workbook is not present yet, maintainers can bootstrap model lists (efficiencies placeholder **0**, not for production) with:

```bash
npm run generate:dwhr-legacy-catalog
```

That command also runs `npm run apply:dwhr-regression-efficiencies` to patch verified Model Catalog rows listed in `test/dwhr-regression-spot-checks.mjs`.

Then replace with `import:dwhr-catalog` once `DWHR_Efficiency_Data_Entry(3).xlsx` is available (required for all 325 efficiencies — regression spot checks alone are not sufficient).
