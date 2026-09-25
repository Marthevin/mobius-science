import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "design.py"
spec = importlib.util.spec_from_file_location("design", SCRIPT)
design = importlib.util.module_from_spec(spec)
spec.loader.exec_module(design)


class DesignTests(unittest.TestCase):
    def test_parallel_continuous_sample_size_and_sensitivity(self):
        request = {
            "schema_version": 1,
            "question": "Does intervention change a continuous outcome?",
            "population": "Adults",
            "design": "parallel_continuous",
            "outcome": "symptom score",
            "unit": "points",
            "effect": 5,
            "sd": 10,
            "effect_basis": "smallest worthwhile effect, prespecified",
            "sd_basis": "external pilot estimate",
            "alpha": 0.05,
            "target_power": 0.8,
            "attrition": 0.1,
            "hypotheses": 1,
        }
        result = design.calculate(request)
        self.assertGreaterEqual(result["analyzable_per_arm"], 63)
        self.assertLessEqual(result["analyzable_per_arm"], 65)
        self.assertGreaterEqual(result["achieved_power"], 0.8)
        self.assertGreater(result["enroll_per_arm"], result["analyzable_per_arm"])
        self.assertEqual(len(result["sensitivity"]), 9)
        self.assertGreater(
            max(x["analyzable_per_arm"] for x in result["sensitivity"]),
            min(x["analyzable_per_arm"] for x in result["sensitivity"]),
        )

    def test_paired_design_and_multiplicity(self):
        base = {
            "schema_version": 1, "question": "Change?", "population": "Adults",
            "design": "paired_continuous", "outcome": "score", "unit": "points",
            "effect": 2, "sd": 5, "effect_basis": "pilot", "sd_basis": "pilot",
            "alpha": 0.05, "target_power": 0.8, "attrition": 0,
            "hypotheses": 1,
        }
        one = design.calculate(base)
        many = design.calculate({**base, "hypotheses": 4})
        self.assertGreater(many["analyzable_total"], one["analyzable_total"])
        self.assertEqual(many["adjusted_alpha"], 0.0125)

    def test_rejects_unsupported_design_and_missing_effect_basis(self):
        with self.assertRaisesRegex(ValueError, "Unsupported design"):
            design.calculate({"design": "cluster_randomized"})
        with self.assertRaisesRegex(ValueError, "effect_basis"):
            design.calculate({"schema_version": 1, "design": "paired_continuous",
                              "question": "Change?", "population": "Adults", "outcome": "score",
                              "effect": 2, "sd": 5})

    def test_zero_effect_is_rejected_before_sample_size_search(self):
        with self.assertRaisesRegex(ValueError, "effect"):
            design.calculate({"schema_version": 1, "question": "Change?", "population": "Adults",
                              "design": "paired_continuous", "outcome": "score", "unit": "points",
                              "effect": 0, "sd": 5, "effect_basis": "prespecified",
                              "sd_basis": "pilot", "alpha": 0.05, "target_power": 0.8,
                              "attrition": 0, "hypotheses": 1})

    def test_cli_writes_rebuildable_artifacts(self):
        request = {
            "schema_version": 1, "question": "Change?", "population": "Adults",
            "design": "parallel_continuous", "outcome": "score", "unit": "points",
            "effect": 2, "sd": 5, "effect_basis": "prespecified SESOI",
            "sd_basis": "prior study", "alpha": 0.05, "target_power": 0.8,
            "attrition": 0.1, "hypotheses": 1,
        }
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = root / "design.json"
            path.write_text(json.dumps(request), encoding="utf-8")
            design.run(path, root / "output")
            result = json.loads((root / "output" / "design-result.json").read_text())
            self.assertEqual(result["design"], "parallel_continuous")
            self.assertIn("Sensitivity", (root / "output" / "analysis-plan.md").read_text())
            self.assertIn("<svg", (root / "output" / "power-curve.svg").read_text())

    def test_chinese_plan_and_power_curve(self):
        request = {
            "schema_version": 1, "language": "zh", "question": "两组指标是否不同？",
            "population": "成年人", "design": "parallel_continuous", "outcome": "指标分数",
            "unit": "分", "effect": 2, "sd": 5, "effect_basis": "预先定义的重要差异",
            "sd_basis": "先验样本", "alpha": 0.05, "target_power": 0.8,
            "attrition": 0.1, "hypotheses": 1,
        }
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = root / "design.json"
            path.write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
            result = design.run(path, root / "output")
            self.assertEqual(result["language"], "zh")
            self.assertIn("## 敏感性分析", (root / "output/analysis-plan.md").read_text(encoding="utf-8"))
            self.assertIn("目标功效", (root / "output/power-curve.svg").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
