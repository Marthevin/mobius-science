# Design input schema

Save UTF-8 `design.json` with `schema_version: 1`, `question`, `population`, `design`, `outcome`, `alpha`, `target_power`, `attrition`, `hypotheses`, `effect_basis`. Optional `language` is `en` (default) or `zh` and controls the analysis-plan and power-curve copy. `alpha` is in (0,1), target power in (0.5,1), attrition in [0,1), and `hypotheses` is a positive count of prespecified primary tests. The calculator applies alpha / hypotheses (Bonferroni).

For `parallel_continuous`: add `unit`, signed `effect` in outcome units, positive pooled `sd`, and `sd_basis`. This is an equal-size two-arm comparison of means.

For `paired_continuous`: add `unit`, signed mean *within-pair* `effect`, positive SD of *within-pair differences* as `sd`, and `sd_basis`. `analyzable_total` means complete pairs, not individual time points.

For `parallel_binary`: add `p_control`, `p_treatment`, `p_control_basis`. The effect is the risk difference. The normal approximation is rejected if any expected event or nonevent cell at the planned n is below five. For rare events, use a method designed for that setting.

Example continuous input:

```json
{"schema_version":1,"question":"Does the intervention change symptom score?","population":"Adults","design":"parallel_continuous","outcome":"symptom score","unit":"points","effect":5,"sd":10,"effect_basis":"prespecified smallest worthwhile effect","sd_basis":"external pilot, with provenance","alpha":0.05,"target_power":0.8,"attrition":0.1,"hypotheses":1}
```

`design.py` writes a byte-identical `design-input.json`, SHA-256-linked result, an analysis plan and SVG curve. Use a fresh output directory for changed assumptions.
