---
name: experimental-design-statistics
description: Use to plan sample size, power, assumptions, sensitivity analyses, and a reproducible statistical analysis plan for common two-arm or paired studies across research fields. Reject complex designs that the bundled calculator cannot represent; use a design-specific statistician or simulation instead.
license: Apache-2.0
---

# Experimental design and statistics

Use this Skill before collecting new data or when writing a preregistered design. Read [input-schema.md](references/input-schema.md) and [methods-and-boundaries.md](references/methods-and-boundaries.md) before running the calculator. If the Notebook cannot execute managed Skill resources, follow [runtime-boundaries.md](references/runtime-boundaries.md).

1. Define the population, primary outcome, contrast, unit of randomization/analysis, estimand, endpoint, two-sided alpha, power target, attrition, and how many primary hypotheses share the error budget. Ask for pilot data or a defensible external estimate. State the *smallest effect of interest* and the source of variance or baseline rate; never infer a target effect from the most optimistic published result. Without pilot data, label all values assumptions and show plausible ranges.
2. Select only a supported design: independent 1:1 parallel groups with a continuous endpoint, paired continuous measurements with an SD of within-pair differences, or independent 1:1 parallel groups with a binary endpoint. Save `design.json` as in the reference and run `python scripts/design.py design.json output_dir`. The script is the calculation authority; do not improvise a different formula and report it as the Skill's result.
3. Review `design-result.json`, `analysis-plan.md`, and `power-curve.svg`. The nine-cell sensitivity grid varies effect and SD for continuous outcomes; the binary route varies the risk difference while event-rate variance changes with it. State the enrolment target *and* analyzable target. Bonferroni is a family-wise correction, not an FDR calculation. Do not claim BH-FDR power from this output.
4. Compare the planned analysis with the power model. The calculator uses a normal approximation; if the actual primary analysis uses a mixed-effects model, survival analysis, clustered or unequal allocation, repeated time points, count outcomes, covariate-adjusted ANCOVA, adaptive design, multiple correlated endpoints, or RNA-seq-wide FDR, stop and use an appropriate simulation or specialist method. A baseline covariate does not automatically justify a smaller sample without a defensible correlation estimate and matched analysis.
5. Write a complete preregistration-ready analysis plan: inclusion/exclusion, missing data and attrition handling, primary versus exploratory endpoints, interval estimates, multiplicity family, protocol deviations, and the exact stopping rule. Optional batch scheduling must preserve treatment randomization; balancing batches does not repair confounding. Delegate formal PDF/DOCX layout to the corresponding document Skill.

Deliver input JSON, result JSON, plan, power figure, provenance for every assumed value, and a note on limitations. Never compute post-hoc power for a finished study as evidence of its result quality.
