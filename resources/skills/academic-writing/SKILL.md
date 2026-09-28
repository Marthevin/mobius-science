---
name: academic-writing
description: Use when planning, drafting, or substantially revising scholarly essays, critical or theoretical articles, reflective academic writing, literature-based arguments, or research manuscripts in English or Chinese; especially when the user needs a defensible argument, disciplined evidence, or substantive revision before DOCX/PDF delivery.
license: Apache-2.0
---

# Academic writing

Write an argument or account that a knowledgeable reader can inspect and challenge. Match the intellectual task before choosing a template. Fluent prose, long bibliographies and successful export do not establish scholarly quality.

## Start with the task

Read [genres.md](references/genres.md) and [brief-and-source-policy.md](references/brief-and-source-policy.md). Save a brief using [writing-brief.json](assets/writing-brief.json): question, genre, audience, languages, length/counting convention, material, citation style, venue/rubric and actual constraints. Keep user requirements separate from agent assumptions. Chinese and media sources are not globally excluded; judge their evidential role and honor this task's explicit restrictions. Use the user's language for progress and the requested language for the manuscript.

Before using scripts or document assets, read [runtime-and-delivery.md](references/runtime-and-delivery.md). Transfer exact resources programmatically through `host.skills.read`; avoid retyping scripts or probing external paths with Notebook/Shell. Check available packages and rendering tools once before choosing the build route.

Honor the requested stage. If asked for step 1, deliver its decisions and saved record, then stop; do not generate a whole article. Otherwise continue through the authorized workflow without asking for routine confirmations. Ask only when a missing answer changes the evidence, genre or author's position materially. A title/topic is not a thesis.

## Work in six passes

1. **Focus.** Identify the tension, uncertainty or interpretive problem. Draft a provisional answer and the strongest plausible alternative. For reporting genres, specify the contribution and inferential limits instead of forcing an essay-style debate. Save the brief before research expands.
2. **Read for a purpose.** Read [evidence.md](references/evidence.md). Build a small source plan keyed to the argument's needs: conceptual authority, concrete material, competing interpretation and context. Use literature skills for discovery, then inspect consequential passages. Retrieve further material to resolve a named gap; stop when the central argument is supported at the declared scope or identify the missing evidence. For a short essay, start with a few pivotal sources and one bounded expansion pass, not every adjacent theory. Search failure is local, not proof of a field-wide gap.
3. **Build the reasoning.** Read [argument-and-revision.md](references/argument-and-revision.md). Save `argument-map.md`: central answer, section purpose, evidence, inferential bridge, rival reading and limit. Test the strongest rival against the same material. Change the thesis if necessary. A theory must distinguish possible interpretations; its name cannot substitute for analysis.

   If unsure how to turn a source into an inferential bridge, read the explicitly synthetic [worked-example.md](references/worked-example.md). Use its reasoning pattern, never its invented evidence.
4. **Draft.** Write `manuscript.md` in sections that advance the argument. Integrate concrete analysis and citations where needed. Read [language.md](references/language.md). Retain the user's defensible ideas and voice when revising. Label hypothetical examples; first-person experience requires user-supplied provenance. Do not invent data, methods, interviews, archive visits, quotations or references to complete a template.
5. **Revise substantively.** Apply [source-and-argument-review.md](references/source-and-argument-review.md): check pivotal passages, construct meanings, author material, competing interpretations, and thesis-to-conclusion consistency. Use [quality-rubric.md](references/quality-rubric.md), with draft evidence for each verdict. Save `revision-memo.md` with actual changes, self-repairs and remaining limits. A self-review is not independent peer review. Fix diagnosed defects; do not cycle cosmetic rewrites or replace the positive argument with caveats.
6. **Check and deliver.** For a substantial completed draft, record consequential claims and source snapshots in `writing-ledger.json` using [record-contract.md](references/record-contract.md). Run `python scripts/audit_writing.py SESSION_DIR` after the final content revision. This checks recorded anchors, hashes and review completeness; it cannot discover all omitted claims or certify truth. Resolve errors; report unresolved semantic or access limits. Read [runtime-and-delivery.md](references/runtime-and-delivery.md), then use `docx-generation` / `pdf-report-generation` for the requested formats, preserving this brief's genre and length. Inspect every rendered page and record final-file hashes separately.

## Keep context recoverable

Update the saved brief with the current stage, source/section files and next action after each completed pass. After compaction, read those files and the revision memo before continuing. Reuse verified sources and frozen results; do not restart broad retrieval or silently replace a conclusion. A source or manuscript edit invalidates dependent review receipts.

## Delivery language

Separate: what was written, evidence limitations, review actually performed, and artifacts actually checked. Distinguish a working draft, an author-review draft and a venue-formatted manuscript. No automated score or document gate warrants “top journal ready,” guaranteed acceptance, or “industry-leading.” A manuscript with missing underlying research remains a draft.
