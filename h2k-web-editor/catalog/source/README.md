Place the authoritative workbook here:

`DWHR_Efficiency_Data_Entry(2).xlsx`

Sheet name: **Model Catalog**

| Column A | Column B | Column C |
|----------|----------|----------|
| Manufacturer | Model | Efficiency at 9.5 L/min (%) |

Then from the repository root run:

```bash
npm run import:dwhr-catalog
```

This regenerates `h2k-web-editor/dwhr-model-catalog.generated.mjs`, which the editor loads at runtime.
