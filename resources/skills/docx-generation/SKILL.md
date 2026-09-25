---
name: docx-generation
description: Use when creating or substantially revising an editable Word DOCX scientific report or manuscript from literature, data, or Notebook results, with evidence-traceable writing and rendered page QA. For a PDF-only deliverable, use pdf-report-generation.
license: Apache-2.0
---

# Scientific Word report

Create an editable research document whose claims, tables, figures, and references a domain reviewer can audit. A DOCX saved successfully is not evidence that its contents or pagination are ready to deliver.

## Route the work

1. Read [report-architecture.md](references/report-architecture.md) for the report type and the target reader or journal. Follow a supplied template or journal instructions when they differ from the default structure.
2. Read [research-integrity.md](references/research-integrity.md) while building the evidence record and again before accepting the final wording. Preserve the complete author metadata and a frozen candidate/search snapshot where literature screening matters.
3. For Chinese literature reviews, read [chinese-literature-review.md](references/chinese-literature-review.md) **before searching**; an English index alone does not establish Chinese primary-source coverage. For English reports, read [english-scientific-writing.md](references/english-scientific-writing.md) before drafting.
4. Read [docx-layout-qa.md](references/docx-layout-qa.md) before typesetting and again during final QA.
5. If OpenCode and a Notebook kernel need managed Skill resources, read [runtime-boundaries.md](references/runtime-boundaries.md). Copy and verify resources into the session workspace; do not execute a blocked external path or call an ad hoc substitute the original validator.

Use literature, data-analysis, and figure Skills for their respective evidence and graphics. Save the complete document source, input snapshots, figures, and claim–evidence ledger alongside the DOCX. If the same study also needs PDF, generate both from the same frozen results and citation metadata, then verify each final file independently.

## Author before formatting

Choose whether this is a narrative review, scoping/systematic review, original research manuscript, or technical report. Do not add protocol language, statistics, figures, or a journal's required declarations unless the underlying work supports them. Draft around the research question: methods that can be repeated, results with denominators and uncertainty, discussion of conflicting evidence and alternative explanations, and a conclusion no broader than the data. Place citations beside the claims they support; a DOI that resolves does not by itself verify a claim.

Before the first build, freeze the source records and computed results. Make the complete ordered bibliography, manuscript text, tables, and figures reproducible from files in the session directory. Use a single set of validated headline values for abstract, body, captions, and tables. Mark inaccessible full text, missing Chinese primary literature, and unresolved disagreements explicitly; do not compensate by padding prose.

## Build an editable DOCX

Check that the working environment has `python-docx`; page proofs need LibreOffice plus Poppler's `pdftoppm` and `pdffonts`. Adapt [python-docx-scientific-template.py](assets/python-docx-scientific-template.py) when those dependencies are available. Use genuine Word `Title`/`Heading` styles, editable tables, inline figures with captions, and `reference(citation, doi=...)` with verified citation text **excluding** the DOI. The default CJK font, Noto Serif SC, is bundled under `assets/fonts/` with its license. The QA script exposes it to LibreOffice without installing it globally; verify the intended Word installation has the font or choose and inspect an available substitute. Check CJK, diacritics, Greek letters, and symbols after rendering. The template is a starting point, not a substitute for a supplied journal or institutional style.

Keep captions paired with figures and short tables, repeat long-table headers, and let rows grow rather than fixing heights or shrinking scientific text to meet an arbitrary page count. Keep the authoritative source file and rebuild from it after every correction. Do not patch only the final `.docx` and lose the source revision.

## Render, inspect, and release

Run `scripts/docx_quality_gate.py` on the candidate. For a substantial Chinese review, start with `--language zh --min-cjk-chars 4000 --require-doi-links`; for a full English research report, start with `--language en --min-words 2500 --require-doi-links`. Adjust length floors to justified scope rather than padding weak evidence. Pass `--soffice /path/to/soffice --strict` when LibreOffice is available to convert **that exact DOCX** into a page proof and PNGs. If using Word's PDF export instead, record its identity and review every page; structural checks alone are incomplete visual QA.

Inspect every rendered page at readable scale for font substitutions, missing glyphs, orphan headings, clipped tables, broken links, caption separation, sparse pages, and references that become tiny or crowded. Check writing quality separately: scope, claim strength, source accuracy, figure/table interpretation, terminology, and abstract-to-results consistency. A LibreOffice proof catches layout problems but Word may paginate differently; verify in the intended editor before claiming a journal-specific final layout.

Deliver the editable DOCX plus the source and research record when computation or literature screening is involved. Keep a QA note with the final DOCX hash, renderer, pages inspected, corrected defects, and outstanding scientific limitations. Label an incomplete evidence base as a draft, even if the DOCX passes structural and visual checks.
