---
name: pdf-report-generation
description: Use when creating or substantially revising a standalone scientific research report PDF from literature, data, or Notebook results, especially when the report must be publication-like, evidence-traceable, reproducible, or visually inspected.
license: Apache-2.0
---

# Scientific PDF report

Turn research records into a report that a domain reviewer can audit. A conversation export, an unreviewed Notebook printout, and a short narrative wrapped in a PDF are not finished research reports.

## Route the work

1. Read [report-architecture.md](references/report-architecture.md) before outlining a full report or manuscript-like deliverable.
2. Read [research-integrity.md](references/research-integrity.md) while building the evidence record and again before finalizing claims.
3. For an English report, read [english-scientific-writing.md](references/english-scientific-writing.md) before drafting and use its language pass before export.
4. For a Chinese literature review, read [chinese-literature-review.md](references/chinese-literature-review.md) **before searching** and again before typesetting. A translated English-index synthesis does not establish coverage of Chinese primary literature.
5. Read [pdf-layout-qa.md](references/pdf-layout-qa.md) before choosing the document layout and again during final QA.
6. When OpenCode and a Notebook kernel must use managed Skill files, read [runtime-boundaries.md](references/runtime-boundaries.md) before transferring or adapting any resource.
7. When using ReportLab, adapt [reportlab-scientific-template.py](assets/reportlab-scientific-template.py). Set `language="zh"` for Chinese prose and use `reference(citation, doi=...)` for verified DOI entries. Do not copy placeholder content into the deliverable.
8. After export, run `scripts/pdf_quality_gate.py` when its Poppler and Pillow dependencies are available. For a substantial Chinese review, use `--language zh --min-cjk-chars 4000 --require-doi-links --strict`, adjusting the character floor to the justified scope; for an English report, use `--language en --min-words 2500 --require-doi-links --strict` as a starting point. When the brief specifies a page range, pass `--min-pages` and `--max-pages`. Treat the gate as a defect detector, not as a substitute for reviewing every rendered page or auditing the evidence.

Managed Skill resources are read-only and may be outside the Notebook's execution root. OpenCode's native Read and the Notebook kernel have different path permissions; follow the transfer and verification procedure in `runtime-boundaries.md` instead of repeatedly trying the same external path through `%run`, `subprocess`, `importlib`, Shell, or Notebook `open()`.

Use literature and analysis Skills to collect evidence and create figures. Their outputs are inputs to this workflow. Keep the query, data snapshot, analysis code or Notebook run, figure inputs, and claim–evidence ledger with the report.

## Content acceptance gate

Before typesetting, require all of the following:

- A precise research question, intended audience, scope, data cutoff, and definitions for central terms.
- Methods detailed enough to repeat the search, data retrieval, filtering, ranking, and analysis.
- Results organized around questions, with denominators, units, uncertainty, and the evaluated universe beside the relevant number.
- A frozen computed-results object or table from which every headline count, rank, category, boundary, and displayed subset can be regenerated.
- A claim–evidence ledger covering every headline conclusion and every material mechanistic or clinical claim.
- Discussion of alternative explanations, disagreements in the evidence, limitations, and what additional evidence would change the conclusion.
- References verified for identity and placed next to the claims they support.
- The complete author list and bibliographic fields verified from the source record before formatting. Never treat the first four authors returned by a search display as the complete list.
- Standalone tables and figure captions that identify data source, population or universe, analysis, units, abbreviations, and uncertainty.

For a broad literature-backed research report, a useful default is 2,500–5,000 English words or 4,000–8,000 Chinese characters and at least ten relevant references, including primary studies where available. These are depth prompts, not quotas: do not pad weak evidence. If the justified report is shorter or has fewer sources, state why its scope supports that length. A five-page file with sparse pages, oversized headings, or a references-only final page does not satisfy the depth gate.

## Draft and compute

Write around the research question rather than around tool calls. Separate retrieved facts, computed results, and interpretation. Never turn a database zero into global absence, a ranking into causality, or a descriptive contrast into statistical significance. Check every entity in a claimed class against a curated ontology or nomenclature source.

Treat exact language as executable assertions. Compute the predicates behind words such as **all**, **none**, **only**, **first**, **begins**, **top N**, and **dominant**, and fail the build or narrow the prose when an assertion does not hold. Generate or verify the abstract, body, table labels, captions, and ledger from the same frozen result object so that a revised rule cannot leave stale numbers elsewhere.

Keep the reproducible record in the Notebook or code, but place enough methods, result tables, and provenance in the PDF for a reader to understand the work without opening the Notebook. Prefer a compact appendix over omitting query details, field definitions, data exclusions, or a claim–evidence table.

Before the first PDF build, save the complete executable document source in the session data directory from the Notebook kernel, or ensure an existing Notebook cell sequence can be rerun without reconstructing prose from memory. Use that source for every revision and deliver it with the PDF.

Freeze the retrieved bibliography and screening decisions as a machine-readable snapshot before writing the review. A transient Notebook variable, query list alone, or the final bibliography does not preserve the screened universe. If a required Skill script is blocked by the Notebook sandbox, follow `runtime-boundaries.md`; do not replace its checks with an ad hoc approximation and report it as the original check.

Keep correction history, discarded interpretations, and first-draft diagnostics in the ledger or QA record. Put them in the report body only when the document is explicitly an audit report or the correction itself is scientifically material.

## Build, inspect, and revise

Let text, tables, references, and appendices flow. Use explicit page breaks only for intentional section boundaries such as an appendix or a landscape table. Embed fonts that cover every script in the report. Escape markup once. Size figures for their final printed width and keep legends outside data-dense regions.

Treat the document source as the rebuild authority. ReportLab Platypus consumes the flowables passed to `doc.build()`, so do not try to filter or reuse that `story` list after the first build; rerun the source that constructs a fresh list, apply the correction there, and build the new revision once.

Use this release loop in order:

1. Freeze the inputs, computed-results object, complete source, and intended QA thresholds.
2. Build a revisioned candidate PDF from a freshly constructed document story.
3. Run the strict automated gate on that exact candidate and record its SHA-256 and byte size.
4. Review the contact sheet for page rhythm, density, and anomalous whitespace.
5. Inspect every page at readable resolution in manageable batches for clipped tables, overlapping legends, missing glyphs, literal HTML entities, stranded headings, weak contrast, tiny labels, inconsistent margins, and unsupported or stale wording.
6. Correct the authoritative source, rebuild a new candidate, and rerun all automated checks. Never reuse a prior candidate's QA result.
7. Reinspect every changed page. If pagination, shared styles, fonts, figures, tables, headers, or footers changed, reinspect every page.
8. Promote the candidate to the final path only after its own gate and visual review pass.

Automated checks, hashes, and PDF byte counts bind evidence to a file but cannot establish visual or scientific quality. Do not claim that a check passed unless it was run on the delivered bytes. Record the renderer, file hash, page count, font-embedding result, automated findings, and page-by-page visual review in the QA note.

## Deliverables

Deliver the PDF plus, when data or computation is involved:

- the input snapshot or query and a compact machine-readable result table;
- the reproducible Notebook or code path;
- the claim–evidence ledger; and
- the QA record for the delivered PDF hash, listing commands run, thresholds, pages inspected, corrected defects, and any remaining limitation.

In chat, report the substantive conclusion and its main limitation, then link the files. Do not use file size, a `%PDF-` header, or `/Type /Page` counts as evidence of report quality.
