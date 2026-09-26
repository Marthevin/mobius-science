# Evidence file contract

All paths are relative to one run directory. UTF-8 JSONL means one JSON object per line. `snapshots/S1.jsonl` contains `{"page": 1, "text": "verbatim extracted page text"}` for each page. Keep the original PDF/HTML and extraction method in the run directory; the snapshot is a machine-checkable transcription, not a replacement for viewing figures or page layout.

- `review-plan.json`: `schema_version: 1`, `question`, `review_type` (`narrative`, `scoping`, `systematic`), ISO-style `cutoff`, `eligibility`, `coverage_axes` list.
- `searches.jsonl`: `database`, exact `query`, `searched_at`, integer `hits`. Preserve exports and exclusions separately when claiming systematic screening.
- `coverage.jsonl`: one row per axis with `axis`, `status` (`evidence`, `searched_empty`, `not_applicable`), and `note`.
- `sources.jsonl`: `id`, `title`, `url`, `kind` (`primary`, `secondary`, `guideline`, `preprint`), `study_id`, `cohort_id`, relative `snapshot`. Verify bibliographic fields against an authoritative record; do not invent DOI values.
- `claims.jsonl`: `id`, a narrow testable `text`, and `axis` from the plan.
- `evidence.jsonl`: `id`, `claim_id`, `source_id`, integer `page`, exact `quote`, `stance` (`supports`, `contradicts`, `mentions`), `directness` (`direct`, `indirect`), `reviewer`.
- `blind-verdicts.jsonl`: `evidence_id`, `stance`, `directness`, `reviewer`, `rationale`. Obtain it from the masked packet, not by re-reading the first verdict.

`freeze` writes `corpus.lock.json`; `blind-packet` writes a packet without initial stance/directness; `build` writes `claim-states.json`, `review.md`, and `audit.json`. The builder excludes mismatched second-pass decisions. It counts independent *cohort IDs*, so two papers on the same cohort do not become convergent replication. It treats a secondary summary as indirect, even if the summary directly states a result. It never converts `mentions` into support.

Statuses: `C2_CONVERGENT` = at least two independent primary direct supporting cohorts and no primary direct contradiction; `C1_SINGLE_DIRECT` = one; `C1_INDIRECT` = support only indirect/secondary; `C_CONFLICTED` = primary direct support and contradiction; `C_REFUTED` = primary direct contradiction without primary direct support; `C_INSUFFICIENT` = no qualified support or contradiction. These labels describe the recorded evidence, not certainty that a passage semantically entails the claim. Manual risk-of-bias and applicability assessment is still required.
