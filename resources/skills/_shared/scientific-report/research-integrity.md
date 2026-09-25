# Evidence and computation record

## Claim–evidence ledger

Build the ledger before drafting and update it after analysis. One row may support several sentences only when their scope is identical.

| Field                    | Record                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Claim ID and exact claim | The wording proposed for the report                                                                  |
| Claim type               | Retrieved fact, computed result, synthesis, or inference                                             |
| Evidence                 | DOI/URL plus section, page, figure, table, or quoted finding; or Notebook run/cell plus input file   |
| Scope                    | Population, model, database, data version, date, inclusion rule, comparison, denominator             |
| Result                   | Value, unit, uncertainty, effect size, test, and correction where applicable                         |
| Qualification            | Missing data, bias, alternative explanation, contradiction, and what the evidence does not establish |
| Disposition              | Retain, narrow, remove, or mark as hypothesis                                                        |

The ledger must cover title and abstract conclusions, every headline result, every mechanistic or clinical assertion that shapes the interpretation, and each recommendation. Unsupported background details should also be cited in the prose even if they do not need their own ledger row.

## Data provenance and reproducibility

For an API or database analysis, save the actual query and response or an immutable input snapshot when feasible. Record:

- endpoint and database name;
- stable entity identifiers rather than labels alone;
- retrieval timestamp and source release or version;
- filters, pagination, sort order, page size, and ranking universe;
- requested fields, derived fields, missing-value policy, and exclusions;
- package or service versions that can affect computation; and
- a table sufficient to recompute each headline count, rank, or plot.

A value of zero, a null value, an omitted field, a failed request, and evidence not found in the wider literature are different states. Preserve those states in the data and phrase conclusions at the scope actually checked.

For ranks, state the candidate universe, scoring definition, sort direction, and tie handling. A top ten re-ranked within an overall top hundred is not the global top ten. For grouped comparisons, show group definitions, denominators, missing values, and whether the contrast is descriptive or inferential.

Treat categorical words as computations. Before writing **all**, **none**, **only**, **first**, **begins at**, **shared**, **identical**, **top N**, or **dominant**, evaluate that exact predicate over the frozen table and record the matching rows and counterexamples. Encode the predicate as an executable assertion when it affects a headline claim. For a boundary claim such as “the pattern begins at rank 24,” distinguish the earliest exception from the first rank after which the pattern is continuous. Define which evidence streams, categories, and missing values enter an aggregate before naming the dominant class.

Freeze headline values in one computed-results object or machine-readable table. Generate tables and figures from it, and generate or verify the abstract, results prose, captions, subset labels, and ledger against it. A label such as “top 15” must fail review when only ten rows are shown unless the caption clearly states that the table is an excerpt. Do not recompute the same number independently in several prose-building blocks.

## Statistical claims

Report effect size and uncertainty before emphasizing a p-value. Name the statistical test, assumptions, sample size, sidedness, multiple-comparison procedure, and analysis population. Do not label a difference significant when no test was run. Do not interpret correlation as causation or target prioritization as target validation.

Use sensitivity analyses for arbitrary thresholds, data-source weights, outlier decisions, or alternative definitions that could change a central conclusion. If a meaningful sensitivity analysis is unavailable, say how that limits the result.

## Biological and clinical classification

Check every member of a proposed entity group against a curated nomenclature or ontology source. A shared gene-symbol prefix does not prove a shared protein family, signaling mechanism, cellular role, or therapeutic relevance. For example, 5-HT3 receptor subunits are [ligand-gated ion channels](https://www.guidetopharmacology.org/GRAC/ObjectDisplayForward?objectId=378), whereas other serotonin receptors are GPCRs. Name a broader category and state exceptions when a set is heterogeneous.

Separate these levels of evidence:

1. molecular association or binding;
2. pathway or cellular perturbation;
3. effect in an animal or disease model;
4. human genetic or observational association;
5. clinical efficacy or safety; and
6. guideline or regulatory status.

Evidence at one level does not automatically establish the next. Record model, intervention, dose, comparator, endpoint, and direction when preclinical or clinical details matter.

## Literature verification

Verify publication identity, authors, year, journal, DOI, and correction or retraction status with a bibliographic service. Then inspect the source content that supports the claim; metadata alone cannot verify a paper's methods, figure, or conclusion. Where only an abstract is available, make that limit explicit. Do not supply a citation or numeric result from memory.

Fetch the full ordered author list for each reference. A search result showing only four authors is a preview, not proof that the fourth is last; changing its delimiter to “&” silently misattributes the work. Preserve the source metadata alongside the formatted bibliography so an editor can compare them. In fields where local-language reports or monographs carry the primary evidence, include those sources or narrow the scope and label the missing coverage.

Prefer the original study for a result and use reviews for context and synthesis. A platform methods paper describes the resource but is not a snapshot of current platform data; cite the live dataset or query separately. When evidence conflicts, report the disagreement and plausible reasons such as population, assay, endpoint, or analysis differences.

## Final audit

Read the ledger against the title, abstract, results, discussion, captions, and conclusion. Narrow or remove any claim whose evidence is weaker or narrower than its wording. Confirm that every figure caption matches its computation, every table label identifies the analyzed universe, all abbreviations are defined, and all cited references appear in the bibliography.

Search the manuscript for correction-process language such as “first draft,” “previous version,” “fixed,” or “the earlier analysis.” Keep that history in the ledger or QA record unless the correction changes the scientific interpretation and the report is intended to document it. The final scientific narrative should state the validated method, result, and limitation directly.
