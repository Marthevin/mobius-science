# Full scientific report architecture

## Decide the document type

Match the structure to the reader's decision. A research report normally needs the complete sequence below. A short technical note may combine sections, but it must preserve methods, evidence, limitations, and provenance.

## Front matter

- **Title:** specific about the subject, evidence type, and scope. Avoid conclusions stronger than the data.
- **Report metadata:** author or agent role, date, data cutoff, software or database versions, and document version.
- **Structured abstract:** Background, Objective, Methods, Results, and Conclusions. Include the central quantitative results, denominators, and primary limitation. Do not introduce facts absent from the body.
- **Key findings (when useful or required by the target journal):** three to five complete statements with evidence strength or qualification. Omit this block when it merely repeats the abstract or creates a stranded list at the next page boundary.

## Main text

### 1. Introduction

Explain the problem, why it matters, established knowledge, unresolved gap, and the precise research question. Define the population, biological level, outcome, and time or database scope. End with the report objective rather than a preview of every section.

### 2. Methods

Write enough detail for a competent reader to reproduce the work:

- literature sources, exact search strings, dates, eligibility rules, screening and extraction approach;
- database endpoints, identifiers, query payloads, release dates, filters, pagination, and fields;
- input files and their hashes or stable versions;
- transformations, missing-value treatment, ranking rules, group definitions, and software versions;
- statistical models, assumptions, uncertainty estimation, correction for multiplicity, and sensitivity analyses; and
- rules used to classify evidence strength or entity type.

If the work is descriptive, say so. If no formal systematic-review protocol was used, do not label the search systematic.

### 3. Results

Organize each subsection around a question. Use this order:

1. evaluated dataset or evidence base and its denominator;
2. observed result with units, uncertainty, and relevant comparison;
3. table or figure that exposes the supporting data;
4. narrow interpretation; and
5. caveat specific to that result.

Keep methods out of the result interpretation except for short reminders needed to understand a number. Report negative and contradictory results when they affect the conclusion. Include the full result table as an appendix or machine-readable companion when the body shows only a subset.

### 4. Discussion

Start with the answer to the research question, calibrated to evidence strength. Compare it with the strongest relevant literature. Discuss plausible mechanisms as hypotheses when evidence is indirect. Address contradictions, alternative explanations, generalizability, data-source bias, measurement limits, and sensitivity to analytic choices.

Separate limitations of the data, the analysis, and the interpretation. State what cannot be concluded and which experiment, dataset, or validation would reduce the main uncertainty.

### 5. Conclusion

Answer the research question in a short paragraph. Repeat only results necessary to support the answer. Include the main limitation and avoid recommendations that require a stronger evidence tier than the report established.

## End matter

- **Data and code availability:** exact file names, Notebook or script path, query snapshot, and access limits.
- **Claim–evidence table:** compact rows for all headline claims.
- **References:** one consistent style, complete identifiers, and DOI or stable URL where available.
- **Appendix:** extended methods, full tables, sensitivity analyses, query payloads, and QA record.

## Depth review

Reject a draft that could have been produced from the abstract alone. Each major conclusion should have a visible chain from source or input, through method and result, to interpretation and limitation. For a broad literature-backed report, check that multiple independent sources are synthesized rather than listed, primary evidence is represented where available, and contradictory evidence is not hidden.

Do not create length with oversized typography, one-paragraph pages, repeated summaries, decorative charts, or one section per forced page. Content density should resemble a technical report: readable body text, purposeful tables and figures, and continuous flow.
