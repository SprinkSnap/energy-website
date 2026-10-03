Place the authoritative workbook here (source only — **not read at runtime**):

`DWHR_Efficiency_Data_Entry(2).xlsx`

Sheet: **Model Catalog**

| Column A | Column B | Column C |
|----------|----------|----------|
| Manufacturer | Model | Efficiency at 9.5 L/min (%) |

Generate the bundled catalog (committed static assets):

```bash
npm run import:dwhr-catalog
```

This writes:

- `h2k-web-editor/dwhr-model-catalog.generated.mjs` (loaded by the editor)
- `h2k-web-editor/data/dwhr-products.json` (same data, for review/diff)

If the workbook is not present yet, maintainers can bootstrap model lists with:

```bash
npm run generate:dwhr-legacy-catalog
```

Then replace with `import:dwhr-catalog` once the Excel file is available.
