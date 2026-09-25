# Extraction contract

Use UTF-8 `extraction.csv` with header:

`study_id,cohort_id,study,year,measure,effect,ci_lo,ci_hi,se,n_trt,n_ctrl,subgroup,design,source_id,source_url,snapshot,page,verbatim,verified_by`

One row is one *independent* comparison. `study_id` and `cohort_id` must each be unique within a primary pooled analysis. Where publications share a cohort or trial arm, select one prespecified estimate or use an appropriate multilevel/dependent-effects model elsewhere. `measure` is one of `MD`, `SMD`, `OR`, `RR`, `HR`; do not mix measures in one run. `effect`, `ci_lo`, `ci_hi` are on the publication's reported scale; ratios and their interval limits must be positive. `se` may be blank, in which case the script derives it from the reported 95% CI using a normal approximation. If supplied, it must match that derivation within 5%. State explicitly when the publication used an alternative CI method; such a study may need a custom extraction route.

`snapshot` is a relative path to page-indexed UTF-8 JSONL; each line is `{"page": 4, "text": "page text"}`. `verbatim` must appear exactly within the stated page text and must contain the three numbers for effect and CI. For a table, preserve its relevant row as an exact transcription and inspect the original visual. `verified_by` names the person or agent pass that checked the original source; this is an audit label, not proof of independent human review. Save the original PDFs/HTML, DOI/registry metadata, and full extraction decisions with the run.

`config.json` requires `schema_version: 1`, `question`, `outcome`, `measure`, `direction`, `analysis_population`, and `review_type` (`narrative`, `scoping`, `systematic`). Set optional `language` to `en` (default) or `zh`; the latter localizes figures and `meta-report.md`, and requires a usable CJK font (set `font_path` if none is found automatically). For a systematic-review claim, include `screening_log.csv` with `source_id,decision,reason` and separately meet protocol, flow, risk-of-bias and PRISMA reporting requirements. The statistical engine rejects fewer than three independent studies for its random-effects prediction route.
