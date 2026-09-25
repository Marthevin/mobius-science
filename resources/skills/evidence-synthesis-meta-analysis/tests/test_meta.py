import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_meta_analysis.py"
spec = importlib.util.spec_from_file_location("meta", SCRIPT)
meta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(meta)


def fixture(root):
    root = Path(root)
    (root / "snapshots").mkdir()
    rows = []
    for i, effect in enumerate((-2.0, -2.5, -1.8, -2.2), 1):
        lo, hi = effect - 1, effect + 1
        quote = f"The estimated mean difference was {effect:.1f} (95% CI {lo:.1f} to {hi:.1f})."
        (root / f"snapshots/s{i}.jsonl").write_text(
            json.dumps({"page": 4, "text": quote}) + "\n", encoding="utf-8")
        rows.append({"study_id": f"trial-{i}", "cohort_id": f"cohort-{i}",
                     "study": f"Synthetic trial {i}", "year": 2020 + i,
                     "measure": "MD", "effect": effect, "ci_lo": lo, "ci_hi": hi,
                     "se": "", "n_trt": 50, "n_ctrl": 50, "subgroup": "all",
                     "design": "RCT", "source_id": f"S{i}",
                     "source_url": f"https://example.org/{i}",
                     "snapshot": f"snapshots/s{i}.jsonl", "page": 4,
                     "verbatim": quote, "verified_by": "fixture-reviewer"})
    with (root / "extraction.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    (root / "config.json").write_text(json.dumps({"schema_version": 1,
        "question": "Does intervention reduce score?", "outcome": "score",
        "measure": "MD", "direction": "negative favors treatment",
        "review_type": "narrative", "analysis_population": "eligible RCTs"}), encoding="utf-8")
    return rows


class MetaTests(unittest.TestCase):
    def test_end_to_end_reml_hksj_and_figures(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            fixture(root)
            result = meta.run(root / "config.json", root / "extraction.csv", root / "output")
            self.assertEqual(result["k"], 4)
            self.assertLess(result["pooled_effect"], -1.8)
            self.assertGreater(result["pooled_effect"], -2.5)
            self.assertGreaterEqual(result["tau2_analysis_scale"], 0)
            self.assertEqual(result["egger"]["status"], "not_interpretable_k_lt_10")
            self.assertEqual(len(result["leave_one_out"]), 4)
            self.assertEqual(len(result["influence"]), 4)
            self.assertTrue(all(item["cook_d_fixed_tau2"] >= 0 for item in result["influence"]))
            self.assertTrue(all(abs(item["studentized_residual_fixed_tau2"]) < 5
                                for item in result["influence"]))
            for name in ("forest", "funnel", "leave-one-out", "heterogeneity"):
                self.assertTrue((root / "output" / f"{name}.svg").is_file())
                self.assertTrue((root / "output" / f"{name}.png").is_file())
            self.assertTrue((root / "output" / "meta-report.md").is_file())

    def test_duplicate_cohort_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            rows = fixture(root)
            rows[1]["cohort_id"] = rows[0]["cohort_id"]
            with (root / "extraction.csv").open("w", newline="") as out:
                writer = csv.DictWriter(out, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            with self.assertRaisesRegex(ValueError, "cohort"):
                meta.run(root / "config.json", root / "extraction.csv", root / "out")

    def test_untraceable_number_and_mixed_measure_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            rows = fixture(root)
            rows[0]["effect"] = -20
            with (root / "extraction.csv").open("w", newline="") as out:
                writer = csv.DictWriter(out, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            with self.assertRaisesRegex(ValueError, "verbatim|quote|interval"):
                meta.run(root / "config.json", root / "extraction.csv", root / "out")

    def test_reml_translation_and_scale_invariance(self):
        effects = [-2.0, -1.6, -2.7, -2.1]
        variances = [0.1, 0.2, 0.12, 0.15]
        original = meta.fit(effects, variances)
        shifted = meta.fit([x + 3 for x in effects], variances)
        scaled = meta.fit([x * 2 for x in effects], [x * 4 for x in variances])
        self.assertAlmostEqual(shifted["mu"], original["mu"] + 3, places=6)
        self.assertAlmostEqual(shifted["tau2"], original["tau2"], places=6)
        self.assertAlmostEqual(scaled["mu"], original["mu"] * 2, places=6)
        self.assertAlmostEqual(scaled["tau2"], original["tau2"] * 4, places=5)

    def test_influence_diagnostics_identify_extreme_study(self):
        effects = [-2.0, -2.1, -1.9, 3.0]
        variances = [0.04] * 4
        model = meta.fit(effects, variances)
        influence = meta.influence_diagnostics(effects, variances, model)
        self.assertEqual(len(influence), 4)
        self.assertEqual(max(range(4), key=lambda i: influence[i]["cook_d_fixed_tau2"]), 3)
        self.assertEqual(max(range(4), key=lambda i: abs(influence[i]["studentized_residual_fixed_tau2"])), 3)

    def test_chinese_report_and_figures_use_chinese_route(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            fixture(root)
            config = json.loads((root / "config.json").read_text(encoding="utf-8"))
            config["language"] = "zh"
            (root / "config.json").write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
            result = meta.run(root / "config.json", root / "extraction.csv", root / "output")
            self.assertEqual(result["language"], "zh")
            report = (root / "output/meta-report.md").read_text(encoding="utf-8")
            self.assertIn("## 方法", report)
            self.assertIn("## 结果", report)
            self.assertIn("影响诊断", report)


if __name__ == "__main__":
    unittest.main()
