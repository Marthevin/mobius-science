# Portable writing record (schema version 1)

Use this at the substantial-draft review stage, not for every outline or minor copyedit. Keep records proportionate: include consequential factual, interpretive and result claims, not a row per connective sentence. The author/reviewer must also inspect the full draft for unrecorded claims; the script cannot find every omission.

`writing-ledger.json` lives beside `manuscript.md`. Paths are relative to that session directory. Save inspected text excerpts as UTF-8 with the source identity, locator and access boundary retained in the ledger. Hash the exact bytes using `hashlib.sha256(Path(path).read_bytes()).hexdigest()`; do not copy a hash from a different revision.

```json
{
  "schema_version": 1,
  "brief": {
    "genre": "critical_essay",
    "language": "en",
    "audience": "social and cultural studies readers",
    "question": "A focused analytical question",
    "scope": "Conceptual analysis of identified public accounts; no original interviews",
    "source_policy": {"allowed_languages": [], "allowed_types": [], "forbid_cjk": false}
  },
  "sources": [{
    "id": "S1",
    "citation": "Verified author, title, date/edition, publisher or journal, identifier/URL",
    "publication_language": "en",
    "source_type": "journal_article",
    "evidence_role": "conceptual_authority",
    "access": "excerpt",
    "snapshot": "sources/S1.txt",
    "sha256": "COMPUTE_FROM_ACTUAL_FILE"
  }],
  "claims": [{
    "id": "C1",
    "text": "The exact consequential sentence as it appears in manuscript.md.",
    "kind": "interpretation",
    "treatment": "qualified",
    "warrant": "Why these particular features justify this bounded interpretation; explain its rival and limit.",
    "evidence": [{
      "source_id": "S1",
      "locator": "Verified page, section or paragraph locator",
      "excerpt": "Exact text from the inspected snapshot, with its qualification retained.",
      "relation": "supports",
      "reason": "Why the passage supports this claim rather than merely mentioning the topic."
    }]
  }],
  "review": {
    "draft_sha256": "COMPUTE_FROM_CURRENT_MANUSCRIPT",
    "evidence_sha256": "COMPUTE_FROM_REVIEWED_BRIEF_SOURCES_AND_CLAIMS",
    "reviewer_type": "self",
    "dimensions": [{
      "dimension": "argument",
      "verdict": "adequate",
      "evidence": "An exact passage or unambiguous section/paragraph reference",
      "reason": "A specific judgment and any correction still required"
    }]
  }
}
```

The example shows one review dimension for readability; the real record needs all nine keys from quality-rubric.md. Replace illustrative text with inspected material. The example is not evidence or a worked research result.

After inspecting the current manuscript and evidence, compute the review receipts with the original
session-local script (see runtime-and-delivery.md for safe materialization):

```python
import hashlib, importlib.util, json
from pathlib import Path
spec = importlib.util.spec_from_file_location('writing_audit', 'scripts/audit_writing.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ledger_path = Path('writing-ledger.json')
ledger = json.loads(ledger_path.read_text(encoding='utf-8'))
ledger['review']['draft_sha256'] = hashlib.sha256(Path('manuscript.md').read_bytes()).hexdigest()
ledger['review']['evidence_sha256'] = module.review_fingerprint(ledger)
ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding='utf-8')
```

`review_fingerprint` hashes canonical JSON of `brief`, `sources`, and `claims` (UTF-8, sorted keys,
no insignificant whitespace; excludes `review`). It binds access levels, declared source hashes,
claim support and warrants as well as wording. Changing any of these requires renewed substantive
review before updating the receipt. Updating hashes alone is not reviewing evidence.

- `access`: `full_text`, `excerpt`, `abstract`, `metadata`. Metadata-only candidates need no snapshot and cannot support manuscript claims. Abstracts support only abstract-level statements; semantic review must enforce that boundary.
- `source_policy`: copy the actual brief's constraints; empty arrays impose no restriction. `allowed_languages` matches each used source's verified `publication_language` (not a translated search title); `allowed_types` matches its `source_type` (for example `journal_article`, `scholarly_book`, `media`, `official_record`). `forbid_cjk` is an optional task-specific manuscript character restriction. The audit checks these declared fields, not the truth of the classifications. Chinese and media sources remain valid when the task and evidential use permit them.
- `evidence_role`: identify the function, such as conceptual authority, empirical estimate, representation, primary text or context. A media account can evidence its own representation; it does not by itself estimate prevalence. The reviewer checks this relation even if structural validation passes.
- `kind`: `source_fact`, `interpretation`, `author_result`, `personal_experience`, `hypothetical`. Interpretation needs `warrant`; actual results need `analysis_provenance`; personal experience needs `user_provenance` identifying the supplied account; hypothetical material needs `explicit_label` identifying its label in the draft. These fields are review pointers, not automatic proof of provenance.
- `treatment`: `asserted`, `qualified`, `reported_disagreement`, `omitted`. An asserted borrowed claim needs supporting evidence. Qualification is not a license to invent: the reviewer still checks its reason and evidence.
- `relation`: `supports`, `limits`, `contradicts`, `context`. An exact textual match does not establish that the relation was correctly judged.
- `reviewer_type`: `self`, `independent_model`, `human`. Describe the real review; two role prompts to the same writing model do not become independent human review.

Run `python scripts/audit_writing.py SESSION_DIR --draft manuscript.md --ledger writing-ledger.json`. The result is structural pass/fail, source/draft errors, open review issues, and `semantic_quality: not_certified`. Output must be separate from the manuscript, ledger and every source snapshot, including filesystem aliases. Counts cover the whole input file; use the brief's body-only convention separately for actual length compliance. Save full CLI output, script identity and any adaptation. Re-run after content changes; bind rendered-document QA to final DOCX/PDF bytes separately.
