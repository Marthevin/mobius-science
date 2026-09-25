import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "proposal.py"
spec = importlib.util.spec_from_file_location("proposal", SCRIPT)
proposal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proposal)


class ProposalTests(unittest.TestCase):
    def test_build_links_evidence_and_design(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            review = {"claims": {"C1": {"text": "Intervention shows a signal.",
                                               "status": "C2_CONVERGENT", "sources": ["S1", "S2"]}}}
            design = {"design": "parallel_continuous", "analyzable_per_arm": 64,
                      "enroll_per_arm": 72, "analyzable_total": 128,
                      "enroll_total": 144, "input_sha256": "abc"}
            proposal_data = {
                "schema_version": 1, "type": "grant", "title": "A reproducible study",
                "audience": "disciplinary grant panel", "language": "en",
                "abstract": "We will test a focused intervention with transparent methods.",
                "background": [{"text": "Prior work shows a signal.", "claim_ids": ["C1"]}],
                "gap": "The effect is not independently tested in our population.",
                "innovation": "A prespecified replication with open materials.",
                "aims": [{"id": "A1", "question": "Does it improve the outcome?",
                          "hypothesis": "The outcome improves.", "outcome": "symptom score",
                          "method": "Parallel randomized comparison.",
                          "risk": "Attrition", "fallback": "Retention sensitivity analysis."}],
                "analysis": "Two-sided group comparison and uncertainty interval.",
                "ethics": "Consent, confidentiality, and monitored adverse events.",
                "data_management": "Deidentified data and preregistered code.",
                "timeline": "Recruit in months 1-6; analyze in months 7-9.",
                "limitations": "Single site limits transportability."
            }
            for name, data in [("review.json", review), ("design.json", design),
                               ("proposal.json", proposal_data)]:
                (root / name).write_text(json.dumps(data), encoding="utf-8")
            result = proposal.build(root / "proposal.json", root / "review.json",
                                    root / "design.json", root / "output")
            self.assertEqual(result["claim_ids"], ["C1"])
            markdown = (root / "output" / "proposal.md").read_text()
            self.assertIn("144", markdown)
            self.assertIn("[C1]", markdown)
            self.assertIn("Plan B", markdown)

    def test_rejects_unsupported_claim_and_missing_fallback(self):
        data = {"schema_version": 1, "type": "grant", "title": "Title", "audience": "panel",
                "language": "en", "abstract": "A", "background": [{"text": "Claim", "claim_ids": ["C1"]}],
                "gap": "Gap", "innovation": "New", "aims": [{"id": "A1", "question": "Q",
                "hypothesis": "H", "outcome": "Y", "method": "M", "risk": "R"}],
                "analysis": "A", "ethics": "E", "data_management": "D",
                "timeline": "T", "limitations": "L"}
        review = {"claims": {"C1": {"status": "C1_SINGLE_DIRECT", "text": "Claim"}}}
        design = {"design": "paired_continuous", "analyzable_total": 30, "enroll_total": 35}
        with self.assertRaisesRegex(ValueError, "fallback"):
            proposal.validate(data, review, design)
        data["aims"][0]["fallback"] = "Alternate measurement"
        review["claims"]["C1"]["status"] = "C_INSUFFICIENT"
        with self.assertRaisesRegex(ValueError, "C1"):
            proposal.validate(data, review, design)

    def test_chinese_route_uses_chinese_section_labels(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            data = {"schema_version": 1, "type": "thesis", "language": "zh",
                    "title": "遗址分布研究计划", "audience": "学位委员会",
                    "abstract": "拟检验明确的问题。", "gap": "现有证据未覆盖该区域。",
                    "innovation": "预注册复现。", "analysis": "报告区间估计。",
                    "ethics": "无需人体数据。", "data_management": "公开脱敏记录。",
                    "timeline": "一年。", "limitations": "样本有限。",
                    "background": [{"text": "已发现初步关联。", "claim_ids": ["C1"]}],
                    "aims": [{"id": "A1", "question": "关联可复现吗？", "hypothesis": "存在关联。",
                              "outcome": "连续指标", "method": "两组比较。", "risk": "样本缺失。",
                              "fallback": "扩大来源。"}]}
            review = {"claims": {"C1": {"text": "有关联", "status": "C1_SINGLE_DIRECT",
                                               "sources": ["S1"]}}}
            design = {"design": "parallel_continuous", "analyzable_total": 40,
                      "enroll_total": 44}
            for name, obj in [("p.json", data), ("r.json", review), ("d.json", design)]:
                (root / name).write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
            proposal.build(root / "p.json", root / "r.json", root / "d.json", root / "out")
            draft = (root / "out" / "proposal.md").read_text(encoding="utf-8")
            self.assertIn("## 研究背景", draft)
            self.assertIn("**备选方案。**", draft)
            self.assertIn("独立平行双组（连续结局）", draft)
            self.assertIn("单队列直接证据", draft)

    def test_meta_summary_requires_sources_in_review(self):
        review = {"claims": {"C1": {"status": "C2_CONVERGENT", "sources": ["S1", "S2"]}}}
        meta = {"k": 2, "measure": "MD", "pooled_effect": -2.1,
                "confidence_interval_95": [-3, -1], "prediction_interval_95": [-5, 1],
                "snapshot_sha256": {"S1": "a", "S3": "b"}}
        with self.assertRaisesRegex(ValueError, "S3"):
            proposal.validate_meta(meta, review)


if __name__ == "__main__":
    unittest.main()
