import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "evidence.py"
spec = importlib.util.spec_from_file_location("evidence", SCRIPT)
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


def put_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")


def put_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in rows), encoding="utf-8")


def fixture(root):
    put_json(root / "review-plan.json", {
        "schema_version": 1, "question": "Does a target intervention improve an outcome?",
        "review_type": "narrative", "cutoff": "2026-09-01",
        "eligibility": "Adult experimental studies with the target outcome",
        "coverage_axes": ["effect", "null_or_harm", "mechanism"],
    })
    put_jsonl(root / "searches.jsonl", [
        {"database": "ExampleIndex", "query": "intervention outcome", "searched_at": "2026-09-01", "hits": 3},
        {"database": "ExampleIndex", "query": "intervention null harm", "searched_at": "2026-09-01", "hits": 1},
    ])
    put_jsonl(root / "coverage.jsonl", [
        {"axis": "effect", "status": "evidence", "note": "two eligible studies"},
        {"axis": "null_or_harm", "status": "searched_empty", "note": "query logged"},
        {"axis": "mechanism", "status": "searched_empty", "note": "no eligible study"},
    ])
    sources = []
    for i in range(1, 3):
        put_jsonl(root / f"snapshots/s{i}.jsonl", [
            {"page": 1, "text": f"Study {i} reports an improvement in the prespecified outcome."}
        ])
        sources.append({"id": f"S{i}", "title": f"Synthetic study {i}",
                        "url": f"https://example.org/study-{i}", "kind": "primary",
                        "study_id": f"study-{i}", "cohort_id": f"cohort-{i}",
                        "snapshot": f"snapshots/s{i}.jsonl"})
    put_jsonl(root / "sources.jsonl", sources)
    put_jsonl(root / "claims.jsonl", [
        {"id": "C1", "text": "The intervention improves the outcome.", "axis": "effect"}
    ])
    put_jsonl(root / "evidence.jsonl", [
        {"id": f"E{i}", "claim_id": "C1", "source_id": f"S{i}",
         "page": 1, "quote": f"Study {i} reports an improvement in the prespecified outcome.",
         "stance": "supports", "directness": "direct", "reviewer": "initial"}
        for i in range(1, 3)
    ])


class EvidenceTests(unittest.TestCase):
    def test_freeze_blind_review_and_build(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            fixture(root)
            evidence.freeze(root)
            packet = evidence.blind_packet(root)
            self.assertNotIn("stance", packet[0])
            self.assertNotIn("directness", packet[0])
            self.assertIn("page_text", packet[0])
            self.assertIn("source_title", packet[0])
            put_jsonl(root / "blind-verdicts.jsonl", [
                {"evidence_id": f"E{i}", "stance": "supports",
                 "directness": "direct", "reviewer": "second-pass",
                 "rationale": "Quote states the measured result."}
                for i in range(1, 3)
            ])
            result = evidence.build(root)
            self.assertEqual(result["claims"]["C1"]["status"], "C2_CONVERGENT")
            self.assertIn("C1", (root / "review.md").read_text())
            self.assertTrue((root / "audit.json").is_file())

    def test_mutated_snapshot_and_bad_quote_fail_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            fixture(root)
            evidence.freeze(root)
            (root / "snapshots/s1.jsonl").write_text('{"page":1,"text":"changed"}\n')
            with self.assertRaisesRegex(ValueError, "hash"):
                evidence.blind_packet(root)

    def test_same_cohort_is_single_direct_and_disagreement_excluded(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            fixture(root)
            sources = [json.loads(x) for x in (root / "sources.jsonl").read_text().splitlines()]
            sources[1]["cohort_id"] = sources[0]["cohort_id"]
            put_jsonl(root / "sources.jsonl", sources)
            evidence.freeze(root)
            put_jsonl(root / "blind-verdicts.jsonl", [
                {"evidence_id": f"E{i}", "stance": "supports",
                 "directness": "direct", "reviewer": "second-pass", "rationale": "Supported"}
                for i in range(1, 3)
            ])
            self.assertEqual(evidence.build(root)["claims"]["C1"]["status"], "C1_SINGLE_DIRECT")
            put_jsonl(root / "blind-verdicts.jsonl", [
                {"evidence_id": "E1", "stance": "mentions", "directness": "direct",
                 "reviewer": "second-pass", "rationale": "Not entailed"},
                {"evidence_id": "E2", "stance": "supports", "directness": "direct",
                 "reviewer": "second-pass", "rationale": "Supported"},
            ])
            result = evidence.build(root)
            self.assertEqual(result["claims"]["C1"]["status"], "C1_SINGLE_DIRECT")
            self.assertEqual(result["excluded_evidence"], ["E1"])


if __name__ == "__main__":
    unittest.main()
