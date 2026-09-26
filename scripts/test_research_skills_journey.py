"""Cross-Skill synthetic regression: review -> meta-analysis -> design -> proposal.

All cited studies in this fixture are explicitly fictional. This test proves the
artifact contracts and bilingual routing, not empirical research quality.
"""

import csv
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
SKILLS = REPO / "resources" / "skills"
os.environ.setdefault("MPLCONFIGDIR", "/private/tmp/mobius-research-mpl")


def module(name, skill, script):
    spec = importlib.util.spec_from_file_location(name, SKILLS / skill / "scripts" / script)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


review_engine = module("evidence_journey", "literature-deep-review", "evidence.py")
meta_engine = module("meta_journey", "evidence-synthesis-meta-analysis", "run_meta_analysis.py")
design_engine = module("design_journey", "experimental-design-statistics", "design.py")
proposal_engine = module("proposal_journey", "research-proposal-writing", "proposal.py")


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def put_lines(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
                    encoding="utf-8")


def run_case(root, language, domain):
    root = Path(root)
    review_dir = root / "review"
    review_dir.mkdir(parents=True, exist_ok=True)
    chinese = language == "zh"
    outcome = "遗址指标" if chinese else "symptom score"
    question = f"公开调查中{outcome}是否不同？" if chinese else "Does the intervention change symptom score?"
    claim = "所纳入的独立研究均报告了负向组间差异。" if chinese else \
        "The included independent studies report negative group differences."
    put(review_dir / "review-plan.json", {"schema_version": 1, "question": question,
        "review_type": "narrative", "cutoff": "2026-09-01",
        "eligibility": "Four fictional independent comparisons for the workflow test",
        "coverage_axes": ["effect", "null_or_harm"]})
    put_lines(review_dir / "searches.jsonl", [
        {"database": "SyntheticIndex", "query": f"{domain} comparison", "searched_at": "2026-09-01", "hits": 4},
        {"database": "SyntheticIndex", "query": f"{domain} null harm", "searched_at": "2026-09-01", "hits": 0}])
    put_lines(review_dir / "coverage.jsonl", [
        {"axis": "effect", "status": "evidence", "note": "four fixture sources"},
        {"axis": "null_or_harm", "status": "searched_empty", "note": "fictional test index"}])
    sources, evidence, extraction = [], [], []
    fields = list(meta_engine.FIELDS)
    for index, effect in enumerate((-2.0, -2.5, -1.8, -2.2), 1):
        lo, hi = effect - 1, effect + 1
        quote = f"The estimated mean difference was {effect:.1f} (95% CI {lo:.1f} to {hi:.1f})."
        relative = f"snapshots/S{index}.jsonl"
        put_lines(review_dir / relative, [{"page": 4, "text": quote}])
        source = {"id": f"S{index}", "title": (f"虚构遗址研究 {index}" if chinese else f"Fictional {domain} study {index}"),
                  "url": f"https://example.invalid/{domain}/{index}", "kind": "primary",
                  "study_id": f"study-{index}", "cohort_id": f"cohort-{index}",
                  "snapshot": relative}
        sources.append(source)
        evidence.append({"id": f"E{index}", "claim_id": "C1", "source_id": f"S{index}",
                         "page": 4, "quote": quote, "stance": "supports",
                         "directness": "direct", "reviewer": "initial-fixture"})
        extraction.append({"study_id": source["study_id"], "cohort_id": source["cohort_id"],
                           "study": source["title"], "year": 2020 + index,
                           "measure": "MD", "effect": effect, "ci_lo": lo, "ci_hi": hi,
                           "se": "", "n_trt": 50, "n_ctrl": 50, "subgroup": "all",
                           "design": "RCT" if not chinese else "observational",
                           "source_id": source["id"], "source_url": source["url"],
                           "snapshot": relative, "page": 4, "verbatim": quote,
                           "verified_by": "fixture-reviewer"})
    put_lines(review_dir / "sources.jsonl", sources)
    put_lines(review_dir / "claims.jsonl", [{"id": "C1", "text": claim, "axis": "effect"}])
    review_engine.freeze(review_dir)
    put_lines(review_dir / "evidence.jsonl", evidence)
    packet = review_engine.blind_packet(review_dir)
    assert all("stance" not in item for item in packet)
    put_lines(review_dir / "blind-verdicts.jsonl", [
        {"evidence_id": item["evidence_id"], "stance": "supports", "directness": "direct",
         "reviewer": "masked-fixture-pass", "rationale": "The numeric comparison is negative."}
        for item in packet])
    review = review_engine.build(review_dir)
    assert review["claims"]["C1"]["status"] == "C2_CONVERGENT"

    meta_config = {"schema_version": 1, "language": language,
                   "question": question, "outcome": outcome,
                   "measure": "MD", "direction": "negative favors first group",
                   "review_type": "narrative", "analysis_population": "four fictional independent studies"}
    put(review_dir / "meta-config.json", meta_config)
    with (review_dir / "extraction.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(extraction)
    meta = meta_engine.run(review_dir / "meta-config.json", review_dir / "extraction.csv",
                           root / "meta")
    assert meta["k"] == 4 and meta["egger"]["status"] == "not_interpretable_k_lt_10"

    design_request = {"schema_version": 1, "language": language,
                      "question": question, "population": "虚构合格研究单位" if chinese else "fictional eligible units",
                      "design": "parallel_continuous", "outcome": outcome, "unit": "分" if chinese else "points",
                      "effect": -2, "sd": 5, "effect_basis": "虚构的预设重要差异" if chinese else "fictional prespecified threshold",
                      "sd_basis": "虚构先验研究，仅作示例" if chinese else "fictional prior study; illustrative only", "alpha": 0.05,
                      "target_power": 0.8, "attrition": 0.1, "hypotheses": 1}
    put(root / "design-input.json", design_request)
    design = design_engine.run(root / "design-input.json", root / "design")

    proposal_data = {"schema_version": 1, "type": "thesis" if chinese else "grant",
        "language": language,
        "title": "遗址指标独立验证研究计划" if chinese else "Independent digital mental health replication",
        "audience": "学位委员会" if chinese else "research grant panel",
        "abstract": "拟使用独立样本检验明确的组间差异。" if chinese else
                    "We propose an independently powered comparison of a prespecified outcome.",
        "background": [{"text": claim, "claim_ids": ["C1"]}],
        "gap": "现有比较不能替代独立验证。" if chinese else
               "Existing comparisons need an independent preregistered replication.",
        "innovation": "预注册与公开分析。" if chinese else "Transparent replication with an auditable ledger.",
        "aims": [{"id": "A1", "question": question,
                  "hypothesis": "差异为负。" if chinese else "The mean difference is negative.",
                  "outcome": outcome, "method": "独立两组比较。" if chinese else "Two independent groups.",
                  "risk": "样本流失。" if chinese else "Attrition.",
                  "fallback": "执行缺失数据敏感性分析。" if chinese else "Prespecified missingness sensitivity."}],
        "analysis": "报告效应量和区间。" if chinese else "Report effect size and uncertainty.",
        "ethics": "遵守适用的伦理要求。" if chinese else "Consent and adverse-event oversight.",
        "data_management": "发布去标识化数据和代码。" if chinese else "Release deidentified data and code.",
        "timeline": "一年内完成。" if chinese else "Complete in one year.",
        "limitations": "合成案例，仅用于工作流测试。" if chinese else
                       "Synthetic case; this is a workflow test, not empirical evidence."}
    put(root / "proposal-input.json", proposal_data)
    receipt = proposal_engine.build(root / "proposal-input.json", review_dir / "claim-states.json",
                                    root / "design" / "design-result.json", root / "proposal",
                                    root / "meta" / "meta-result.json")
    assert receipt["claim_ids"] == ["C1"]
    assert (root / "proposal" / "proposal.md").is_file()
    return {"review": review, "meta": meta, "design": design, "proposal": receipt}


class JourneyTests(unittest.TestCase):
    def test_english_psychology_and_chinese_archaeology(self):
        with tempfile.TemporaryDirectory() as td:
            for language, domain in (("en", "psychology"), ("zh", "archaeology")):
                case = Path(td) / domain
                result = run_case(case, language, domain)
                self.assertEqual(result["review"]["claims"]["C1"]["status"], "C2_CONVERGENT")
                self.assertEqual(result["meta"]["k"], 4)
                self.assertGreater(result["design"]["enroll_total"], 0)


if __name__ == "__main__":
    unittest.main()
