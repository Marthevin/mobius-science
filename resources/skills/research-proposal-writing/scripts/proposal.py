#!/usr/bin/env python3
"""Validate evidence links and build an editable research-proposal Markdown source."""

import argparse
import hashlib
import json
from pathlib import Path


TYPES = {"grant", "thesis", "fellowship", "course", "internal"}
DIRECT_STATES = {"C2_CONVERGENT", "C1_SINGLE_DIRECT"}


def text(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required")
    return value.strip()


def validate(data, review, design):
    if data.get("schema_version") != 1 or data.get("type") not in TYPES:
        raise ValueError("Unsupported proposal schema or type")
    if data.get("language") not in ("en", "zh"):
        raise ValueError("language must be en or zh")
    for key in ("title", "audience", "abstract", "gap", "innovation", "analysis",
                "ethics", "data_management", "timeline", "limitations"):
        text(data.get(key), key)
    paragraphs = data.get("background")
    if not isinstance(paragraphs, list) or not paragraphs:
        raise ValueError("background needs at least one evidence-linked paragraph")
    claim_ids = set()
    claims = review.get("claims")
    if not isinstance(claims, dict):
        raise ValueError("review has no claims")
    for index, item in enumerate(paragraphs):
        text(item.get("text"), f"background[{index}].text")
        ids = item.get("claim_ids")
        if not isinstance(ids, list) or not ids:
            raise ValueError(f"background[{index}] needs claim_ids")
        for cid in ids:
            if cid not in claims or claims[cid].get("status") not in DIRECT_STATES:
                raise ValueError(f"Unsupported or unresolved claim {cid}")
            claim_ids.add(cid)
    aims = data.get("aims")
    if not isinstance(aims, list) or not aims or len(aims) > 5:
        raise ValueError("Proposal needs 1-5 focused aims")
    ids = set()
    for index, aim in enumerate(aims):
        for key in ("id", "question", "hypothesis", "outcome", "method", "risk", "fallback"):
            text(aim.get(key), f"aims[{index}].{key}")
        if aim["id"] in ids:
            raise ValueError(f"Duplicate aim ID {aim['id']}")
        ids.add(aim["id"])
    if design.get("design") not in ("parallel_continuous", "paired_continuous", "parallel_binary"):
        raise ValueError("Unsupported or missing design result")
    size = design.get("enroll_total")
    if not isinstance(size, int) or size < 2:
        raise ValueError("Design result lacks a valid enrollment count")
    if not isinstance(design.get("analyzable_total"), int) or design["analyzable_total"] > size:
        raise ValueError("Design result lacks a valid analyzable count")
    return sorted(claim_ids)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate_meta(meta, review):
    sources = {source for claim in review.get("claims", {}).values()
               for source in claim.get("sources", [])}
    meta_sources = set(meta.get("snapshot_sha256", {}))
    missing = sorted(meta_sources - sources)
    if missing:
        raise ValueError(f"Meta-analysis has sources not in review: {', '.join(missing)}")
    if not meta_sources or meta.get("k") != len(meta_sources):
        raise ValueError("Meta-analysis study count or sources are inconsistent")
    for key in ("measure", "pooled_effect", "confidence_interval_95", "prediction_interval_95"):
        if key not in meta:
            raise ValueError(f"Meta-analysis missing {key}")


def build(proposal_path, review_path, design_path, output_dir, meta_path=None):
    proposal_path, review_path, design_path = map(Path, (proposal_path, review_path, design_path))
    output_dir = Path(output_dir)
    data, review, design = [json.loads(path.read_text(encoding="utf-8"))
                            for path in (proposal_path, review_path, design_path)]
    claim_ids = validate(data, review, design)
    meta = None
    if meta_path is not None:
        meta_path = Path(meta_path)
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        validate_meta(meta, review)
    output_dir.mkdir(parents=True, exist_ok=True)
    zh = data["language"] == "zh"
    labels = {
        "abstract": "摘要" if zh else "Abstract",
        "background": "研究背景" if zh else "Background and rationale",
        "gap": "研究缺口" if zh else "Specific gap",
        "innovation": "创新性" if zh else "Innovation",
        "aim": "研究目标" if zh else "Aim",
        "hypothesis": "假设" if zh else "Hypothesis",
        "outcome": "主要结局" if zh else "Primary outcome",
        "method": "方法" if zh else "Method",
        "risk": "风险" if zh else "Risk",
        "fallback": "备选方案" if zh else "Plan B",
        "design": "研究设计与分析" if zh else "Study design and analysis",
        "ethics": "伦理与数据管理" if zh else "Ethics and data stewardship",
        "timeline": "时间安排" if zh else "Timeline",
        "limitations": "局限性" if zh else "Limitations",
        "provenance": "论断证据溯源" if zh else "Claim provenance",
    }
    descriptor = f"{data['type'].title()} proposal" if not zh else "研究计划"
    lines = [f"# {data['title']}", "", f"**{descriptor} · {data['audience']}**", "",
             f"## {labels['abstract']}", "", data["abstract"], "",
             f"## {labels['background']}", ""]
    for item in data["background"]:
        lines += [f"{item['text']} " + " ".join(f"[{cid}]" for cid in item["claim_ids"]), ""]
    lines += [f"## {labels['gap']}", "", data["gap"], "",
              f"## {labels['innovation']}", "", data["innovation"], ""]
    for aim in data["aims"]:
        lines += [f"## {labels['aim']} {aim['id']}: {aim['question']}", "",
                  f"**{labels['hypothesis']}。** {aim['hypothesis']}" if zh else f"**Hypothesis.** {aim['hypothesis']}", "",
                  f"**{labels['outcome']}。** {aim['outcome']}" if zh else f"**Primary outcome.** {aim['outcome']}", "",
                  f"**{labels['method']}。** {aim['method']}" if zh else f"**Method.** {aim['method']}", "",
                  f"**{labels['risk']}。** {aim['risk']}" if zh else f"**Risk.** {aim['risk']}", "",
                  f"**{labels['fallback']}。** {aim['fallback']}" if zh else f"**Plan B.** {aim['fallback']}", ""]
    design_names = {
        "parallel_continuous": "独立平行双组（连续结局）",
        "paired_continuous": "配对连续结局",
        "parallel_binary": "独立平行双组（二分类结局）",
    }
    design_summary = (f"预设设计：{design_names[design['design']]}。计划纳入 {design['enroll_total']} 人，"
                      f"目标可分析样本 {design['analyzable_total']} 人。假设、校正和敏感性分析见 design-result.json。") if zh else (
                      f"Prespecified design: {design['design']}. Planned enrollment: "
                      f"{design['enroll_total']} participants; analyzable target: "
                      f"{design['analyzable_total']}. See the linked design-result.json "
                      "for assumptions, multiplicity, and sensitivity.")
    lines += [f"## {labels['design']}", "", design_summary, "", data["analysis"], "",
              f"## {labels['ethics']}", "", data["ethics"], "", data["data_management"], "",
              f"## {labels['timeline']}", "", data["timeline"], "",
              f"## {labels['limitations']}", "", data["limitations"], ""]
    if meta is not None:
        effect = meta["pooled_effect"]
        ci = meta["confidence_interval_95"]
        pi = meta["prediction_interval_95"]
        summary = (f"既有研究汇总（{meta['measure']}，k={meta['k']}）：合并效应 {effect:.3g}，"
                   f"95% 置信区间 {ci[0]:.3g} 至 {ci[1]:.3g}，"
                   f"95% 预测区间 {pi[0]:.3g} 至 {pi[1]:.3g}。请结合异质性和偏倚评估解释。") if zh else (
                   f"Existing-study synthesis ({meta['measure']}, k={meta['k']}): pooled effect "
                   f"{effect:.3g}, 95% CI {ci[0]:.3g} to {ci[1]:.3g}, "
                   f"95% prediction interval {pi[0]:.3g} to {pi[1]:.3g}. "
                   "Interpret with heterogeneity and risk-of-bias assessment.")
        lines += [f"## {'定量证据综合' if zh else 'Quantitative evidence synthesis'}", "", summary, ""]
    lines += [f"## {labels['provenance']}", ""]
    for cid in claim_ids:
        state = review["claims"][cid]
        status_names = {"C2_CONVERGENT": "多队列直接证据一致", "C1_SINGLE_DIRECT": "单队列直接证据"}
        status = status_names.get(state["status"], state["status"]) if zh else state["status"]
        source_label = "来源编号" if zh else "source IDs"
        lines += [f"- [{cid}] {state['text']} — {status}（{state['status']}）；{source_label}："
                  f"{', '.join(state.get('sources', [])) or '未提供'}." if zh else
                  f"- [{cid}] {state['text']} — {status}; {source_label}: "
                  f"{', '.join(state.get('sources', [])) or 'not supplied'}." ]
    lines += ["", "此溯源索引不能代替已核验的参考文献表和原文审查。" if zh else
              "This provenance index does not replace a verified bibliography or source-level audit.", ""]
    source = output_dir / "proposal.md"
    source.write_text("\n".join(lines), encoding="utf-8")
    receipt = {"schema_version": 1, "type": data["type"], "language": data["language"],
               "claim_ids": claim_ids, "aim_ids": [x["id"] for x in data["aims"]],
               "proposal_input_sha256": digest(proposal_path),
               "review_sha256": digest(review_path), "design_sha256": digest(design_path),
               **({"meta_sha256": digest(meta_path)} if meta_path is not None else {}),
               "proposal_md_sha256": digest(source),
               "warning": "Structural checks do not establish novelty, ethical approval, or prose quality."}
    (output_dir / "proposal-audit.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("proposal", "review", "design", "output"):
        parser.add_argument(name, type=Path)
    parser.add_argument("--meta", type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.proposal, args.review, args.design, args.output, args.meta), indent=2))
