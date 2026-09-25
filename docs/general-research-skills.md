# General research Skill suite

The four featured Skills form a composable route from literature to a reviewable proposal. Each remains useful on its own. This downstream addition lives under `resources/skills/` and adds only manifest and loading tests to the application; it does not modify upstream research/runtime classes.

| Skill | Accepted input | Deterministic output | Human scientific judgement still needed |
| --- | --- | --- | --- |
| `literature-deep-review` | Search, coverage, source/page snapshots, claims and two verdict passes | Locked corpus, claim states, review source and hash audit | Search completeness, entailment, risk of bias, figure interpretation |
| `evidence-synthesis-meta-analysis` | One verified independent effect per cohort in `extraction.csv` | REML/HKSJ summary, prediction interval, leave-one-out, conditional influence diagnostics, four SVG/PNG figures, report source | Effect comparability, study bias, heterogeneity and applicability |
| `experimental-design-statistics` | Prespecified simple design, target effect, variance/rate assumptions | Sample/enrolment counts, sensitivity grid, power curve, analysis-plan source | Whether assumptions and approximate model match the real study |
| `research-proposal-writing` | Reviewed claim states, design result, optional compatible meta result, structured proposal | Linked proposal Markdown and input/output hash receipt | Novelty, feasibility, ethics, persuasion, sponsor-specific requirements |

## Chain and boundaries

`literature-review` or connected scholarly sources → `literature-deep-review` → optional `evidence-synthesis-meta-analysis` → `experimental-design-statistics` for a future study → `research-proposal-writing` → `pdf-report-generation` / `docx-generation`.

The literature corpus is frozen before the evidence pass. Later source or claim changes require a new freeze. The meta engine accepts only one independent two-group estimate per cohort, 3 or more studies, one effect measure and design/subgroup per run. The design engine accepts only equal-allocation parallel continuous/binary or paired continuous comparisons, with a large-sample normal approximation and Bonferroni family-wise correction. It cannot calculate RNA-seq BH-FDR power or model clusters/repeated measures. The proposal builder rejects unsupported background claims and uses the linked design sample size rather than a prose copy. The evidence-status algorithm and numeric quote checks are conservative consistency gates, not automated peer review.

The design and meta engines accept `language: "en" | "zh"` (English by default). Chinese meta plots require a CJK font and fail if none is available; the design's editable SVG uses a CJK-capable fallback stack. The final PDF/DOCX language is controlled separately by the document Skills and must match the source draft.

`evidence-synthesis-meta-analysis` uses a single Python/SciPy engine in this implementation rather than the proposed R/metafor engine. That choice permits one tested path through the managed Python Notebook without a second language runtime. Its methods follow documented REML, modified Hartung–Knapp and prediction-interval practice; [Cochrane's meta-analysis chapter](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-10) notes the small-k caveats, and [Cochrane's missing-evidence chapter](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-13) cautions against interpreting funnel asymmetry with fewer than ten studies. An independent R/metafor benchmark remains desirable before any claim of parity.

## OpenCode resource access

The manifest lists all four as featured Skills. The packaged Skill directory includes `SKILL.md`, `references/`, `scripts/`, and tests. The normal projection copies the full directory into the OpenCode configuration root. If OpenCode's native Read marks a managed file external, use `host.skills.read('skill-name', 'references/file.md')` or the corresponding script path. This reads bytes through the app's supported interface; it does not authorize running a managed path in the Notebook. Transfer the complete script into the session workspace, verify byte length and SHA-256, and run that copy. The Skill's `runtime-boundaries.md` gives the exact procedure.

## Verification performed

- Unit tests cover corpus drift, quote mismatches, second-pass disagreement, cohort deduplication, statistical multiplicity/sensitivity, extraction errors, REML invariance, conditional influence diagnostics, unsupported claims, and Chinese proposal headings.
- A synthetic English psychology grant and Chinese archaeology thesis each run through all four engines. They create four plots in the requested language, a review ledger, a design plan and power curve, a proposal source, and PDF/DOCX smoke-test outputs. All papers, search results and effect estimates in these fixtures are fictional and carry `example.invalid` URLs; they are not scientific conclusions.
- Production `SkillRegistry`, app-owned materialization and `host.skills.read` tests verify that scripts and references are discoverable and readable. A real installed managed OpenCode ACP integration test confirms nested reference access while denying private config reads and writes to the Skill. The runtime's actual model decisions are not proven by these deterministic tests.
- The two synthetic PDFs use the existing `pdf-report-generation` template and passed its strict structural/render gate; every page was rendered for visual review. Chinese and English PDF builds run in separate processes because ReportLab font names are process-global. The DOCX files use the existing `docx-generation` template and pass OOXML structural checks. macOS Quick Look first-page thumbnails were visually inspected, but full page rendering is pending a Word/LibreOffice renderer in the test environment; strict DOCX visual QA therefore remains incomplete.

These checks establish an end-to-end technical route. Industry-leading scientific writing quality additionally requires field-expert blinded review on real, licensed corpora; a predeclared benchmark set with gold-standard extraction and citation truth; comparison against strong existing workflows; and page-level editorial review of the actual intended deliverable. Do not call the synthetic examples submission-ready research.
