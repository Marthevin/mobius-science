"""Check writing-record consistency, not scholarly truth. Python standard library only."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

DIMENSIONS = ('task', 'contribution', 'argument', 'evidence', 'precision',
              'alternatives', 'structure', 'language', 'transparency')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def review_fingerprint(ledger):
    payload = {key: ledger.get(key) for key in ('brief', 'sources', 'claims')}
    return digest(json.dumps(payload, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':'), allow_nan=False).encode('utf-8'))


def normalized(text):
    return ' '.join(unicodedata.normalize('NFC', text).split())


def local(root, name):
    if not isinstance(name, str) or not name or Path(name).is_absolute():
        raise ValueError('unsafe-path: use a session-relative file')
    target = (root / name).resolve()
    if target == root or root not in target.parents:
        raise ValueError('unsafe-path: snapshot escapes session directory')
    return target


def audit(root, draft_name='manuscript.md', ledger_name='writing-ledger.json'):
    root = Path(root).resolve()
    errors, warnings = [], []
    result = {'structural_status': 'fail', 'semantic_quality': 'not_certified',
              'errors': errors, 'warnings': warnings}
    try:
        draft_bytes = local(root, draft_name).read_bytes()
        draft = draft_bytes.decode('utf-8')
        ledger = json.loads(local(root, ledger_name).read_text(encoding='utf-8'))
        if not isinstance(ledger, dict) or ledger.get('schema_version') != 1:
            raise ValueError('schema: expected schema_version 1')
        result['draft_sha256'] = digest(draft_bytes)
        result['evidence_sha256'] = review_fingerprint(ledger)
        result['counts'] = {'english_words': len(re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)*", draft)),
                            'cjk_characters': len(re.findall(r'[\u3400-\u9fff]', draft))}
        brief = ledger.get('brief', {})
        if not isinstance(brief, dict):
            raise ValueError('schema: brief must be an object')
        for key in ('genre', 'language', 'audience', 'question', 'scope'):
            if not isinstance(brief, dict) or not isinstance(brief.get(key), str) or not brief[key].strip():
                errors.append('missing-brief: ' + key)
        sources, claims = ledger.get('sources'), ledger.get('claims')
        if not isinstance(sources, list) or not isinstance(claims, list) or not claims:
            raise ValueError('schema: sources and nonempty claims must be lists')
        policy = brief.get('source_policy', {})
        if not isinstance(policy, dict):
            raise ValueError('schema: source_policy must be an object')
        for field in ('allowed_languages', 'allowed_types'):
            value = policy.get(field, [])
            if not isinstance(value, list) or any(not isinstance(x, str) or not x.strip() for x in value):
                raise ValueError('schema: ' + field + ' must be a list of nonempty strings')
        if not isinstance(policy.get('forbid_cjk', False), bool):
            raise ValueError('schema: forbid_cjk must be a boolean')
        if policy.get('forbid_cjk') and result['counts']['cjk_characters']:
            errors.append('manuscript-language-policy: explicit no-CJK brief violated')
        used_sources = set()
        for claim in claims:
            if not isinstance(claim, dict) or claim.get('treatment') == 'omitted':
                continue
            if not isinstance(claim.get('evidence', []), list):
                raise ValueError('schema: evidence must be a list')
            used_sources.update(row['source_id'] for row in claim.get('evidence', [])
                                if isinstance(row, dict) and isinstance(row.get('source_id'), str))
        index, snapshots = {}, {}
        for source in sources:
            if not isinstance(source, dict) or not isinstance(source.get('id'), str):
                raise ValueError('schema: source needs a string id')
            sid = source['id']
            if sid in index:
                errors.append('duplicate-source: ' + sid)
            index[sid] = source
            # Restrictions are task-local and only apply to sources actually used.
            # Declared publication metadata still requires substantive verification.
            if sid in used_sources:
                if policy.get('allowed_languages') and source.get('publication_language') not in policy['allowed_languages']:
                    errors.append('source-language-policy: ' + sid)
                if policy.get('allowed_types') and source.get('source_type') not in policy['allowed_types']:
                    errors.append('source-type-policy: ' + sid)
            if not source.get('citation'):
                errors.append('missing-citation: ' + sid)
            if source.get('access') not in ('full_text', 'excerpt', 'abstract', 'metadata'):
                errors.append('invalid-access: ' + sid)
            if source.get('access') == 'metadata':
                continue
            try:
                data = local(root, source.get('snapshot')).read_bytes()
                if digest(data) != source.get('sha256'):
                    errors.append('source-hash: ' + sid)
                text = data.decode('utf-8')
                if text.lstrip('\ufeff \t\r\n').startswith('%PDF-'):
                    raise ValueError('source-not-extracted-text: PDF bytes are not a readable passage')
                snapshots[sid] = text
            except (ValueError, OSError, UnicodeError) as error:
                errors.append(f'source-file: {sid}: {error}')
        ids = set()
        for claim in claims:
            if not isinstance(claim, dict) or not isinstance(claim.get('id'), str):
                raise ValueError('schema: claim needs a string id')
            cid = claim['id']
            if cid in ids:
                errors.append('duplicate-claim: ' + cid)
            ids.add(cid)
            if claim.get('treatment') not in ('asserted', 'qualified', 'reported_disagreement', 'omitted'):
                errors.append('invalid-treatment: ' + cid)
            if claim.get('treatment') == 'omitted':
                continue
            text = claim.get('text')
            if not isinstance(text, str) or not text.strip() or normalized(text) not in normalized(draft):
                errors.append('missing-draft-anchor: ' + cid)
            kind = claim.get('kind')
            if kind not in ('source_fact', 'interpretation', 'author_result', 'personal_experience', 'hypothetical'):
                errors.append('invalid-kind: ' + cid)
            if kind == 'interpretation' and not claim.get('warrant'):
                errors.append('missing-warrant: ' + cid)
            if kind == 'personal_experience' and not claim.get('user_provenance'):
                errors.append('experience-provenance: ' + cid)
            if kind == 'author_result' and not claim.get('analysis_provenance'):
                errors.append('analysis-provenance: ' + cid)
            if kind == 'hypothetical' and not claim.get('explicit_label'):
                errors.append('hypothetical-label: ' + cid)
            evidence = claim.get('evidence', [])
            if not isinstance(evidence, list):
                raise ValueError('schema: evidence must be a list')
            relations = []
            for row in evidence:
                if not isinstance(row, dict):
                    raise ValueError('schema: evidence record must be an object')
                sid = row.get('source_id')
                if not isinstance(sid, str) or sid not in index:
                    errors.append('unknown-source: ' + cid)
                    continue
                if index[sid].get('access') == 'metadata':
                    errors.append(f'metadata-only: {cid}/{sid}')
                    continue
                relation = row.get('relation')
                if relation not in ('supports', 'limits', 'contradicts', 'context'):
                    errors.append('invalid-relation: ' + cid)
                relations.append(relation)
                if not row.get('locator') or not row.get('reason'):
                    errors.append('incomplete-evidence-review: ' + cid)
                excerpt = row.get('excerpt')
                if not isinstance(excerpt, str) or not excerpt.strip() or normalized(excerpt) not in normalized(snapshots.get(sid, '')):
                    errors.append(f'excerpt-mismatch: {cid}/{sid}')
            if kind in ('source_fact', 'interpretation'):
                if not evidence:
                    errors.append('missing-evidence: ' + cid)
                if claim.get('treatment') == 'asserted' and 'supports' not in relations:
                    errors.append('unsupported-assertion: ' + cid)
                if claim.get('treatment') == 'asserted' and 'contradicts' in relations:
                    warnings.append('contrary-evidence-needs-semantic-review: ' + cid)
        review = ledger.get('review', {})
        if not isinstance(review, dict):
            raise ValueError('schema: review must be an object')
        if review.get('draft_sha256') != result['draft_sha256']:
            errors.append('stale-review: review does not match the current draft')
        if review.get('evidence_sha256') != result['evidence_sha256']:
            errors.append('stale-evidence-review: review does not match the current brief, sources and claims')
        reviewer = review.get('reviewer_type')
        if reviewer not in ('self', 'independent_model', 'human'):
            errors.append('reviewer-type: disclose who actually reviewed')
        result['reviewer_type'] = reviewer
        dimensions = review.get('dimensions', [])
        if not isinstance(dimensions, list):
            raise ValueError('schema: review dimensions must be a list')
        seen = set()
        for row in dimensions:
            if not isinstance(row, dict):
                raise ValueError('schema: review dimension must be an object')
            name = row.get('dimension')
            if name not in DIMENSIONS or name in seen:
                errors.append('invalid-review-dimension: ' + str(name))
            seen.add(name)
            if row.get('verdict') not in ('strong', 'adequate', 'revision_needed', 'unassessable'):
                errors.append('invalid-review-verdict: ' + str(name))
            if not row.get('evidence') or not row.get('reason'):
                errors.append('incomplete-review-detail: ' + str(name))
            if row.get('verdict') in ('revision_needed', 'unassessable'):
                warnings.append('open-review-issue: ' + str(name))
        if seen != set(DIMENSIONS):
            errors.append('incomplete-review: all nine dimensions need a reasoned verdict')
        if not draft.strip():
            errors.append('empty-draft')
    except (ValueError, OSError, UnicodeError, TypeError) as error:
        errors.append(str(error))
    if not errors:
        result['structural_status'] = 'pass'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--draft', default='manuscript.md')
    parser.add_argument('--ledger', default='writing-ledger.json')
    parser.add_argument('--output', default='writing-audit.json')
    args = parser.parse_args()
    report = audit(args.directory, args.draft, args.ledger)
    root = args.directory.resolve()
    output = local(root, args.output)
    inputs = [local(root, args.draft), local(root, args.ledger)]
    try:
        ledger = json.loads(inputs[1].read_text(encoding='utf-8'))
        for source in ledger.get('sources', []):
            if source.get('snapshot'):
                inputs.append(local(root, source['snapshot']))
    except (OSError, ValueError, TypeError, AttributeError) as error:
        parser.error('Cannot safely identify audit inputs: ' + str(error))
    for path in inputs:
        if output == path or (output.exists() and path.exists() and output.samefile(path)):
            parser.error('Output must not overwrite the draft, ledger or source snapshots')
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['structural_status'] == 'pass' else 1


if __name__ == '__main__':
    sys.exit(main())
