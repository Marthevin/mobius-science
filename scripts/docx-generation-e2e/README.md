# Reproducible DOCX writing scenarios

`run_scenarios.py` builds three editable documents from a pinned public dataset and checked literature records:

1. Chinese targeted narrative review with an evidence-boundary table and linked references.
2. English descriptive data report whose table and scatter plot come from the same 150 UCI Iris rows.
3. Mixed Chinese–English methods appendix with a longer editable table, figure, and numeric cross-checks.

Install `python-docx` and `Pillow` in a test environment, then run:

```bash
python scripts/docx-generation-e2e/run_scenarios.py /tmp/mobius-docx-e2e
python resources/skills/docx-generation/scripts/docx_quality_gate.py \
  /tmp/mobius-docx-e2e/outputs/01-中文定向文献综述.docx \
  --output-dir /tmp/mobius-docx-e2e/qa-chinese --language zh \
  --min-cjk-chars 1000 --require-doi-links --soffice /path/to/soffice --strict
```

Repeat the quality gate for `02-English-data-report.docx` with `--language en --min-words 900`, and for `03-中英混排方法附录.docx` with `--language mixed --min-cjk-chars 450 --min-words 80`. Inspect **every** generated page PNG, and record page-specific layout findings. The quality gate intentionally does not claim to judge the scientific prose from word count alone.

The English report is a descriptive test note, not a journal submission. The Chinese review's small open-access sample is not a systematic survey. The source and license record for the dataset is in [`data/SOURCE.md`](data/SOURCE.md).

The reviewed DOCX files and their LibreOffice PDF proofs from 2026-09-25 are in [`examples/`](examples/); the exact hashes and limitations are in [`VERIFICATION-2026-09-25.md`](VERIFICATION-2026-09-25.md). Regenerate them when the template or scientific text changes.
