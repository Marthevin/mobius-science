# English scientific writing and editing

## Draft for an English-speaking scientific reader

Write directly in English instead of translating sentence structure from another language. Prefer concrete subjects and verbs: “The analysis identified 18 genes” is clearer than “It was found that 18 genes could be identified.” Keep terminology, spelling convention, capitalization, hyphenation, and abbreviations consistent throughout.

Use past tense for completed methods and observations, present tense for established knowledge and what a figure shows, and modal verbs for uncertainty. Match claim strength to evidence:

| Evidence supports                     | Suitable wording                       |
| ------------------------------------- | -------------------------------------- |
| Direct measured result                | showed, estimated, was associated with |
| Consistent synthesis with limitations | supports, suggests, is consistent with |
| Indirect mechanism or extrapolation   | may, could, is hypothesized to         |
| Evidence absent from one source       | was not identified in this dataset     |

Avoid “proved,” “demonstrated causality,” “no evidence exists,” “clinically validated,” and “significant” unless the design and analysis establish those exact meanings.

## Terminology and numbers

- Define each abbreviation at first use in the abstract and again in the main text if needed.
- Preserve official gene, protein, disease, drug, database, and assay names. Check entity capitalization against an authoritative source.
- Use numerals with units and insert a nonbreaking space where the renderer supports it: `25 mg`, `6 months`, `95% CI`.
- Report exact denominators: `18 of 100 genes (18%)`, not “18% of genes” when the universe may be unclear.
- Give effect estimates with uncertainty and test details when inferential language is used.
- Use decimal precision justified by the data; align comparable values in tables.
- Spell out a number at the start of a sentence or rewrite the sentence.

## Paragraphs and sections

Open each paragraph with its scientific point. Use subsequent sentences for evidence, interpretation, and limitation. Avoid paragraphs that merely enumerate papers. Synthesize why results agree or differ across populations, assays, models, or analytic definitions.

Keep the abstract self-contained and structured as Background, Objective, Methods, Results, and Conclusions unless the requested venue specifies another form. Put the main quantitative findings in Results and the principal limitation in Conclusions. Do not use citations in the abstract unless the requested format requires them.

## Tables, figures, and citations

Write titles and captions that stand alone. A caption should state what is shown, the data source or cohort, the analysis or encoding, units, abbreviation definitions, and the meaning of error bars or uncertainty. Do not title a plot “Results” or “Top genes” without naming the ranking and universe.

Place citations immediately after the supported clause or sentence. Avoid attaching one citation to a paragraph containing several different factual claims. Use one bibliographic style consistently and verify that author names with diacritics survive export.

## English language QA pass

Read the rendered document, not only the source. Check:

1. title, abstract, headings, captions, table headers, and references for untranslated text;
2. subject–verb agreement, article use, singular/plural consistency, and incomplete sentences;
3. consistent spelling convention, terminology, abbreviations, and capitalization;
4. overstatement, causal language, and uses of “significant”;
5. citation placement and correspondence with the reference list;
6. line breaks or font substitutions that split symbols, units, names, or DOI strings; and
7. captions and table notes at their final printed size.

When possible, extract text from the final deliverable and search for CJK characters in an English-only report, placeholder tokens, literal HTML entities, and repeated template text. Treat the result as a diagnostic and still review every rendered page.
