import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import subprocess
import sys
import os

spec = importlib.util.spec_from_file_location('audit_writing', Path(__file__).parents[1] / 'scripts/audit_writing.py')
audit_writing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_writing)


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


class AuditTests(unittest.TestCase):
    def test_published_audit_checksum_matches_package_bytes(self):
        package = Path(__file__).parents[1]
        expected, relative = (package / 'SHA256SUMS').read_text().strip().split()
        self.assertEqual(relative, 'scripts/audit_writing.py')
        self.assertEqual(expected, hashlib.sha256((package / relative).read_bytes()).hexdigest())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.draft = 'The source describes a localized practice, not a population estimate.'
        self.source = 'This small case illustrates a localized practice. It does not estimate prevalence.'
        (self.root / 'manuscript.md').write_text(self.draft)
        (self.root / 'source.txt').write_text(self.source)
        self.ledger = {
            'schema_version': 1,
            'brief': {'genre': 'critical_essay', 'language': 'en', 'audience': 'academic readers',
                      'question': 'What can this case establish?', 'scope': 'one case'},
            'sources': [{'id': 'S1', 'citation': 'Synthetic evaluation fixture, 2026',
                         'access': 'excerpt', 'snapshot': 'source.txt', 'sha256': sha(self.source)}],
            'claims': [{'id': 'C1', 'text': self.draft, 'kind': 'source_fact', 'treatment': 'asserted',
                        'evidence': [{'source_id': 'S1', 'locator': 'paragraph 1',
                                      'excerpt': self.source, 'relation': 'supports',
                                      'reason': 'The passage explicitly limits generalization.'}]}],
            'review': {'draft_sha256': sha(self.draft), 'reviewer_type': 'self',
                       'dimensions': [{'dimension': name, 'verdict': 'adequate',
                                       'evidence': self.draft, 'reason': 'Synthetic test only.'}
                                      for name in audit_writing.DIMENSIONS]}
        }
        self.ledger['review']['evidence_sha256'] = audit_writing.review_fingerprint(self.ledger)

    def check(self):
        (self.root / 'writing-ledger.json').write_text(json.dumps(self.ledger))
        return audit_writing.audit(self.root)

    def test_complete_structural_record_is_not_semantic_certification(self):
        r = self.check()
        self.assertEqual(r['structural_status'], 'pass')
        self.assertEqual(r['semantic_quality'], 'not_certified')
        self.assertEqual(r['reviewer_type'], 'self')

    def test_chinese_and_media_are_allowed_without_a_task_restriction(self):
        self.ledger['sources'][0].update(publication_language='zh', source_type='media',
                                        evidence_role='representation', citation='作者，报道，2026')
        self.ledger['review']['evidence_sha256'] = audit_writing.review_fingerprint(self.ledger)
        self.assertEqual(self.check()['structural_status'], 'pass')

    def test_task_specific_source_policy_rejects_disallowed_language_and_type(self):
        self.ledger['brief']['source_policy'] = {
            'allowed_languages': ['en'], 'allowed_types': ['journal_article', 'scholarly_book']}
        self.ledger['sources'][0].update(publication_language='zh', source_type='media')
        self.ledger['review']['evidence_sha256'] = audit_writing.review_fingerprint(self.ledger)
        errors = str(self.check()['errors'])
        self.assertIn('source-language-policy', errors)
        self.assertIn('source-type-policy', errors)

    def test_restricted_sources_require_declared_publication_metadata(self):
        self.ledger['brief']['source_policy'] = {'allowed_languages': ['en']}
        self.ledger['review']['evidence_sha256'] = audit_writing.review_fingerprint(self.ledger)
        self.assertIn('source-language-policy', str(self.check()['errors']))

    def test_malformed_brief_or_evidence_returns_a_failed_receipt(self):
        self.ledger['brief'] = []
        self.assertEqual(self.check()['structural_status'], 'fail')
        self.ledger['brief'] = {'genre': 'essay', 'language': 'en', 'audience': 'readers', 'question': 'question', 'scope': 'scope'}
        self.ledger['claims'][0]['evidence'] = 12
        self.assertEqual(self.check()['structural_status'], 'fail')

    def test_zero_cjk_is_an_explicit_task_constraint(self):
        (self.root / 'manuscript.md').write_text(self.draft + '\n中文附注')
        self.ledger['brief']['source_policy'] = {'forbid_cjk': True}
        self.ledger['review']['draft_sha256'] = sha(self.draft + '\n中文附注')
        self.ledger['review']['evidence_sha256'] = audit_writing.review_fingerprint(self.ledger)
        self.assertIn('manuscript-language-policy', str(self.check()['errors']))

    def test_changed_draft_invalidates_review(self):
        (self.root / 'manuscript.md').write_text(self.draft + ' New unsupported conclusion.')
        self.assertIn('stale-review', str(self.check()['errors']))

    def test_changed_source_invalidates_snapshot(self):
        (self.root / 'source.txt').write_text('Different evidence')
        self.assertIn('source-hash', str(self.check()['errors']))

    def test_updated_evidence_still_invalidates_old_review(self):
        self.assertEqual(self.check()['structural_status'], 'pass')
        updated = 'This observation requires a different interpretation.'
        (self.root / 'source.txt').write_text(updated)
        self.ledger['sources'][0]['sha256'] = sha(updated)
        self.ledger['claims'][0]['evidence'][0]['excerpt'] = updated
        self.assertIn('stale-evidence-review', str(self.check()['errors']))

    def test_cli_cannot_overwrite_snapshot_or_hardlink(self):
        self.check()
        os.link(self.root / 'source.txt', self.root / 'alias.txt')
        for output in ('source.txt', 'alias.txt'):
            result = subprocess.run([
                sys.executable, str(Path(audit_writing.__file__)), str(self.root), '--output', output
            ], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((self.root / 'source.txt').read_text(), self.source)

    def test_fabricated_quote_is_rejected(self):
        self.ledger['claims'][0]['evidence'][0]['excerpt'] = 'All people behave this way.'
        self.assertIn('excerpt-mismatch', str(self.check()['errors']))

    def test_metadata_is_not_passage_support(self):
        self.ledger['sources'][0]['access'] = 'metadata'
        self.assertIn('metadata-only', str(self.check()['errors']))

    def test_pdf_decoded_as_text_is_not_a_readable_source(self):
        # A real webfetch failure mode: UTF-8 decoding succeeds after replacement,
        # and matching hashes/excerpts alone would otherwise certify this record.
        raw_pdf = '%PDF-1.5\n%\ufffd\ufffd\ufffd\ufffd\n1 0 obj\nstream\nnot extracted prose\nendstream'
        (self.root / 'source.txt').write_text(raw_pdf)
        self.ledger['sources'][0].update(access='full_text', sha256=sha(raw_pdf))
        self.ledger['claims'][0]['evidence'][0]['excerpt'] = 'not extracted prose'
        self.ledger['review']['evidence_sha256'] = audit_writing.review_fingerprint(self.ledger)
        self.assertIn('source-not-extracted-text', str(self.check()['errors']))

    def test_readable_source_can_discuss_a_pdf_signature(self):
        text = 'A PDF file begins with %PDF-1.5; this is a readable explanation.'
        (self.root / 'source.txt').write_text(text)
        self.ledger['sources'][0]['sha256'] = sha(text)
        self.ledger['claims'][0]['evidence'][0]['excerpt'] = text
        self.ledger['review']['evidence_sha256'] = audit_writing.review_fingerprint(self.ledger)
        self.assertEqual(self.check()['structural_status'], 'pass')

    def test_contradiction_cannot_support_assertion(self):
        self.ledger['claims'][0]['evidence'][0]['relation'] = 'contradicts'
        self.assertIn('unsupported-assertion', str(self.check()['errors']))

    def test_disagreement_can_be_reported_without_forced_consensus(self):
        self.ledger['claims'][0]['treatment'] = 'reported_disagreement'
        self.ledger['claims'][0]['evidence'][0]['relation'] = 'contradicts'
        self.ledger['review']['evidence_sha256'] = audit_writing.review_fingerprint(self.ledger)
        self.assertEqual(self.check()['structural_status'], 'pass')

    def test_personal_experience_requires_user_provenance(self):
        self.ledger['claims'][0]['kind'] = 'personal_experience'
        self.assertIn('experience-provenance', str(self.check()['errors']))

    def test_interpretation_requires_inferential_bridge(self):
        self.ledger['claims'][0]['kind'] = 'interpretation'
        self.assertIn('missing-warrant', str(self.check()['errors']))

    def test_unknown_source_and_duplicate_ids_are_rejected(self):
        self.ledger['sources'].append(dict(self.ledger['sources'][0]))
        self.ledger['claims'][0]['evidence'][0]['source_id'] = 'invented'
        errors = str(self.check()['errors'])
        self.assertIn('duplicate-source', errors)
        self.assertIn('unknown-source', errors)

    def test_outside_workspace_snapshot_is_rejected(self):
        self.ledger['sources'][0]['snapshot'] = '../elsewhere.txt'
        self.assertIn('unsafe-path', str(self.check()['errors']))

    def test_empty_review_does_not_pass(self):
        self.ledger['review']['dimensions'] = []
        self.assertIn('incomplete-review', str(self.check()['errors']))

    def test_malformed_records_return_errors_not_success(self):
        self.ledger['claims'] = 'not a list'
        self.assertEqual(self.check()['structural_status'], 'fail')


if __name__ == '__main__':
    unittest.main()
