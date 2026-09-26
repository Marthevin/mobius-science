---
name: literature-deep-review
description: Use for an auditable cross-domain evidence review, claim-level source checking, contradiction search, or a reproducible literature synthesis. Use literature-review for a quick paper lookup; use evidence-synthesis-meta-analysis for quantitative pooling after eligible studies are screened.
license: Apache-2.0
---

# Auditable literature synthesis

Build conclusions from a frozen source corpus and a claim–evidence ledger. Source identity, a quote on an identified page, and two review passes are necessary checks; none alone proves a claim. Start by reading [review-methods.md](references/review-methods.md) and [evidence-contract.md](references/evidence-contract.md). For managed OpenCode/Notebook resources, read [runtime-boundaries.md](references/runtime-boundaries.md) before moving any script.

## Workflow

1. Define the question, review type, date cutoff, inclusion/exclusion rules, and domain-specific coverage axes in `review-plan.json`. Use `literature-review` and relevant primary databases to search synonyms, seminal work, recent work, null and contradictory results. Save exact database, query, date, hit count in `searches.jsonl`; record every planned axis in `coverage.jsonl` as `evidence`, `searched_empty`, or `not_applicable` with a reason. A zero-hit search is local to that query, not proof of global absence.
2. Screen and deduplicate publications by study/cohort, including preprint–journal pairs and secondary reports. Save one `sources.jsonl` record per eligible source, with a stable source ID and page-indexed text snapshot. Retain the original PDF/HTML and bibliographic metadata outside the script inputs; verify author/title/year/DOI from the source and check retractions. If full text is inaccessible, mark the missing coverage and do not invent anchors.
3. Write the planned narrow claims to `claims.jsonl`, then run `python scripts/evidence.py freeze RUN_DIR`. This hashes the plan, searches, coverage, claims, source index, page snapshots, and exact Skill script. Do not alter the corpus after freezing; create a new run for a changed corpus. This is not a claim of a complete systematic search.
4. Write `evidence.jsonl` using the contract. One row connects one frozen claim to an exact quoted passage and page. Distinguish direct empirical evidence from indirect citation or discussion; `mentions` never counts as support. Inspect figures/tables visually when their data matter, because extracted text cannot establish what an image shows.
5. Run `python scripts/evidence.py blind-packet RUN_DIR`; give its packet to a second-pass reviewer without the first stance/directness. Save `blind-verdicts.jsonl` with a reason for every row. A second pass by the same model is a consistency check, not an independent human review. Do not fabricate a distinct reviewer identity; if none is available, label this gate incomplete and do not call the run fully audited.
6. Run `python scripts/evidence.py build RUN_DIR`. Resolve excluded disagreements by returning to the source or narrowing the claim and starting a new frozen run. Read `claim-states.json`, `review.md`, and `audit.json`; write the interpretive narrative around them, including conflicting and missing evidence. The deterministic state is a conservative screening aid, not an LLM-free semantic judgement.
7. Send the reviewed narrative, source records, ledger, and audit receipt to `pdf-report-generation` or `docx-generation` for typesetting. Run that Skill's document gate and inspect every rendered page. Never call an unreviewed evidence ledger a publication-ready systematic review.

## Stop conditions

Stop or mark the output a draft if a source cannot be verified, an exact quote is missing from the cited page, a claim remains disputed, the planned negative search is absent, or a material finding has only indirect evidence. A systematic-review label additionally requires a reproducible screening log, flow counts, risk-of-bias assessment, protocol status, and the applicable PRISMA checklist; this engine alone does not supply those.

Keep `RUN_DIR` with the source snapshots, original sources, scripts or verified session-local adaptations, and final document. Cite the final document hash separately from `audit.json`.
