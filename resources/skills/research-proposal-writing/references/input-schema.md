# Proposal input and build contract

`proposal.json` uses `schema_version: 1`; `type` is `grant`, `thesis`, `fellowship`, `course`, or `internal`; `language` is `en` or `zh`. Required text: `title`, `audience`, `abstract`, `gap`, `innovation`, `analysis`, `ethics`, `data_management`, `timeline`, `limitations`.

`background` is a nonempty list of `{ "text": "...", "claim_ids": ["C1"] }`. Each ID must resolve to a direct supported claim in `claim-states.json` (`C1_SINGLE_DIRECT` or `C2_CONVERGENT`). If the source is indirect or conflicted, keep the paragraph outside the deterministic builder until the evidence is resolved or revise the claim narrowly. The check is deliberately strict for confident material claims.

`aims` contains one to five records with `id`, `question`, `hypothesis`, `outcome`, `method`, `risk`, `fallback`. The builder uses the enrolment and analyzable target from `design-result.json` rather than copying numbers from an uncontrolled prose draft. Keep the input result, its original design assumptions, and both file hashes alongside the final proposal.

The output Markdown is a complete editable draft source, not a formatted Word or PDF file. Bibliography metadata and source-level audits remain in the literature run; the emitted claim index prevents lost links but must be expanded into a verified reference list before external submission.

If a compatible quantitative synthesis exists, append `--meta path/to/meta-result.json` to the command. The builder checks that every meta-analysis source ID appears in the reviewed claim ledger, then inserts pooled effect, CI and prediction interval with an interpretation caveat. It hashes the meta result in the audit. It does not transform a pooled association into a causal finding.
