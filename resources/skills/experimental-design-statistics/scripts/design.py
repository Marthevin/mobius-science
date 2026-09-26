#!/usr/bin/env python3
"""Deterministic, dependency-free planning for three prespecified simple designs.

Normal-approximation power is deliberately labelled approximate. This is not a
substitute for a simulation or a model-specific calculation for complex designs.
"""

import argparse
import hashlib
import html
import json
import math
import statistics
from pathlib import Path


NORMAL = statistics.NormalDist()
DESIGNS = {"parallel_continuous", "paired_continuous", "parallel_binary"}


def require_text(data, key):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return value.strip()


def require_number(data, key, low=None, high=None):
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{key} must be a finite number")
    if low is not None and value <= low:
        raise ValueError(f"{key} must be greater than {low}")
    if high is not None and value >= high:
        raise ValueError(f"{key} must be less than {high}")
    return float(value)


def normal_cdf(value):
    return NORMAL.cdf(value)


def power_for_n(n, data, adjusted_alpha):
    zcrit = NORMAL.inv_cdf(1 - adjusted_alpha / 2)
    if data["design"] == "parallel_continuous":
        noncentrality = abs(data["effect"]) / (data["sd"] * math.sqrt(2 / n))
    elif data["design"] == "paired_continuous":
        noncentrality = abs(data["effect"]) / (data["sd"] / math.sqrt(n))
    else:
        p0, p1 = data["p_control"], data["p_treatment"]
        standard_error = math.sqrt((p0 * (1 - p0) + p1 * (1 - p1)) / n)
        noncentrality = abs(p1 - p0) / standard_error
    return normal_cdf(noncentrality - zcrit) + normal_cdf(-noncentrality - zcrit)


def minimum_n(data, adjusted_alpha):
    target = data["target_power"]
    high = 8
    while power_for_n(high, data, adjusted_alpha) < target:
        high *= 2
        if high > 10_000_000:
            raise ValueError("Required sample size exceeds ten million; review assumptions")
    low = 1
    while low + 1 < high:
        mid = (low + high) // 2
        if power_for_n(mid, data, adjusted_alpha) >= target:
            high = mid
        else:
            low = mid
    return high


def calculate(request):
    if request.get("design") not in DESIGNS:
        raise ValueError("Unsupported design; use a design-specific model and statistician")
    if request.get("schema_version") != 1:
        raise ValueError("schema_version must be 1")
    if request.get("language", "en") not in ("en", "zh"):
        raise ValueError("language must be en or zh")
    data = dict(request)
    for key in ("question", "population", "outcome", "effect_basis", "sd_basis"):
        if key == "sd_basis" and data["design"] == "parallel_binary":
            continue
        require_text(data, key)
    require_number(data, "alpha", 0, 1)
    require_number(data, "target_power", 0.5, 1)
    attrition = require_number(data, "attrition", -1, 1)
    if attrition < 0:
        raise ValueError("attrition must be nonnegative")
    hypotheses = data.get("hypotheses")
    if isinstance(hypotheses, bool) or not isinstance(hypotheses, int) or hypotheses < 1:
        raise ValueError("hypotheses must be a positive integer")
    if data["design"] == "parallel_binary":
        for key in ("p_control", "p_treatment"):
            require_number(data, key, 0, 1)
        if data["p_control"] == data["p_treatment"]:
            raise ValueError("Control and treatment probabilities cannot be equal")
        require_text(data, "p_control_basis")
        data["effect"] = abs(data["p_treatment"] - data["p_control"])
    else:
        require_number(data, "effect")
        if data["effect"] == 0:
            raise ValueError("effect must be nonzero; choose a meaningful target difference")
        require_number(data, "sd", 0)
        require_text(data, "unit")
    adjusted_alpha = data["alpha"] / hypotheses
    n = minimum_n(data, adjusted_alpha)
    if data["design"] == "parallel_binary":
        for p in (data["p_control"], data["p_treatment"]):
            if min(n * p, n * (1 - p)) < 5:
                raise ValueError("Normal approximation is unreliable: expected cell count < 5")
    sensitivity = []
    for effect_factor in (0.75, 1.0, 1.25):
        for noise_factor in (0.75, 1.0, 1.25):
            alternate = dict(data)
            if data["design"] == "parallel_binary":
                p0 = data["p_control"]
                p1 = p0 + (data["p_treatment"] - p0) * effect_factor
                if not 0 < p1 < 1:
                    continue
                alternate["p_treatment"] = p1
                # Binary variability is fixed by the event rates; no fictitious SD multiplier.
                if noise_factor != 1.0:
                    continue
            else:
                alternate["effect"] = data["effect"] * effect_factor
                alternate["sd"] = data["sd"] * noise_factor
            sensitivity.append({"effect_factor": effect_factor, "noise_factor": noise_factor,
                                "analyzable_per_arm": minimum_n(alternate, adjusted_alpha)})
    enroll_n = math.ceil(n / (1 - attrition))
    arms = 1 if data["design"] == "paired_continuous" else 2
    return {
        "schema_version": 1, "language": data.get("language", "en"),
        "design": data["design"], "method": "two-sided normal approximation",
        "multiplicity": "Bonferroni family-wise error", "adjusted_alpha": adjusted_alpha,
        "target_power": data["target_power"], "achieved_power": power_for_n(n, data, adjusted_alpha),
        "analyzable_per_arm": n if arms == 2 else None,
        "enroll_per_arm": enroll_n if arms == 2 else None,
        "analyzable_total": n * arms, "enroll_total": enroll_n * arms,
        "attrition": attrition, "hypotheses": hypotheses,
        "effect_basis": data["effect_basis"],
        "sd_basis": data.get("sd_basis", data.get("p_control_basis")),
        "sensitivity": sensitivity,
        "limitations": [
            "Power uses a large-sample normal approximation, not an exact t, logistic, or mixed model.",
            "Assumes independent units, equal allocation for parallel designs, two-sided testing, and a fixed endpoint.",
            "Pilot variance and target effect uncertainty are not estimated by this calculation.",
            "For multiple hypotheses this uses Bonferroni FWER; it does not estimate BH-FDR power.",
        ],
    }


def svg_curve(data, result):
    zh = result["language"] == "zh"
    nstar = result["analyzable_per_arm"] or result["analyzable_total"]
    ns = [max(2, round(nstar * (0.35 + 1.55 * i / 40))) for i in range(41)]
    left, top, width, height = 70, 30, 590, 280
    maximum = max(ns)
    points = " ".join(
        f"{left + width * n / maximum:.1f},{top + height * (1-power_for_n(n, data, result['adjusted_alpha'])):.1f}"
        for n in ns
    )
    target_y = top + height * (1 - result["target_power"])
    achieved_y = top + height * (1 - result["achieved_power"])
    star_x = left + width * nstar / maximum
    title = html.escape(data["question"])
    axis_label = "每组可分析样本量（配对设计：总数）" if zh else "Analyzable participants per arm (paired: total)"
    footnote = ("近似正态模型功效；假设与敏感性分析见 analysis-plan.md" if zh else
                "Approximate normal-model power; assumptions and sensitivity in analysis-plan.md")
    target_label = "目标功效" if zh else "target power"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="740" height="385" viewBox="0 0 740 385">
<rect width="740" height="385" fill="#ffffff"/><text x="70" y="20" font-family="Arial Unicode MS, Noto Sans CJK SC, sans-serif" font-size="15">{title}</text>
<path d="M {left} {top} V {top+height} H {left+width}" fill="none" stroke="#334155" stroke-width="1.5"/>
<path d="M {left} {target_y:.1f} H {left+width}" stroke="#64748b" stroke-dasharray="5 4"/>
<polyline points="{points}" fill="none" stroke="#0f766e" stroke-width="3"/>
<circle cx="{star_x:.1f}" cy="{achieved_y:.1f}" r="5" fill="#be123c"/>
<text x="{left}" y="360" font-family="Arial Unicode MS, Noto Sans CJK SC, sans-serif" font-size="12">{axis_label}</text>
<text x="12" y="{target_y:.1f}" font-family="Arial Unicode MS, Noto Sans CJK SC, sans-serif" font-size="12">{result['target_power']:.0%}</text>
<text x="{star_x+7:.1f}" y="{target_y-8:.1f}" font-family="Arial Unicode MS, Noto Sans CJK SC, sans-serif" font-size="12">n={nstar}</text>
<text x="70" y="377" font-family="Arial Unicode MS, Noto Sans CJK SC, sans-serif" font-size="10">{footnote}</text>
<text x="{left+width-110}" y="{target_y-8:.1f}" font-family="Arial Unicode MS, Noto Sans CJK SC, sans-serif" font-size="10">{target_label}</text></svg>'''


def run(input_path, output_dir):
    input_path, output_dir = Path(input_path), Path(output_dir)
    raw = input_path.read_bytes()
    data = json.loads(raw)
    result = calculate(data)
    result["input_sha256"] = hashlib.sha256(raw).hexdigest()
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "design-input.json").write_bytes(raw)
    (output_dir / "design-result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rows = "\n".join(
        f"| {x['effect_factor']:.2f} | {x['noise_factor']:.2f} | {x['analyzable_per_arm']} |"
        for x in result["sensitivity"]
    )
    if result["language"] == "zh":
        plan = (f"# 统计分析计划\n\n研究问题：{data['question']}\n\n"
                f"目标人群：{data['population']}\n\n主要结局：{data['outcome']}\n\n"
                f"设计：{data['design']}；平行组设计采用等比例分配。\n\n"
                f"目标效应依据：{data['effect_basis']}。变异度或基线风险依据：{result['sd_basis']}。\n\n"
                f"双侧 α：{data['alpha']}；Bonferroni 校正后 α：{result['adjusted_alpha']:.6g}；"
                f"目标功效：{data['target_power']:.0%}。\n\n"
                f"可分析样本总数：{result['analyzable_total']}；计入 {data['attrition']:.0%} 流失率后计划纳入："
                f"{result['enroll_total']}。\n\n"
                "## 敏感性分析\n\n以下效应与变异度倍数是规划假设，不是新增观测。\n\n"
                "| 效应倍数 | 变异度倍数 | 每组可分析样本量／配对总数 |\n| ---: | ---: | ---: |\n"
                f"{rows}\n\n## 局限性\n\n"
                "- 功效采用大样本正态近似，不等于精确 t 检验、逻辑回归或混合模型计算。\n"
                "- 假定独立分析单位、平行设计等比例分配、双侧检验与固定终点。\n"
                "- 本计算未估计先验方差和目标效应本身的不确定性。\n"
                "- 多重假设采用 Bonferroni 家族错误率校正，未估计 BH-FDR 功效。\n")
    else:
        plan = (f"# Statistical analysis plan\n\nQuestion: {data['question']}\n\n"
                f"Population: {data['population']}\n\nPrimary outcome: {data['outcome']}\n\n"
                f"Design: {data['design']}; equal allocation where applicable.\n\n"
                f"Target effect basis: {data['effect_basis']}. Variability/base-rate basis: {result['sd_basis']}.\n\n"
                f"Two-sided alpha: {data['alpha']}; Bonferroni-adjusted alpha: {result['adjusted_alpha']:.6g}; "
                f"target power: {data['target_power']:.0%}.\n\n"
                f"Analyzable total: {result['analyzable_total']}; enroll total after "
                f"{data['attrition']:.0%} attrition: {result['enroll_total']}.\n\n"
                "## Sensitivity\n\nEffect and variability factors below are planning assumptions, not new measurements.\n\n"
                "| Effect factor | Noise factor | Analyzable per arm / paired total |\n| ---: | ---: | ---: |\n"
                f"{rows}\n\n## Limitations\n\n" + "\n".join(f"- {x}" for x in result["limitations"]) + "\n")
    (output_dir / "analysis-plan.md").write_text(plan, encoding="utf-8")
    (output_dir / "power-curve.svg").write_text(svg_curve(data, result), encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    print(json.dumps(run(arguments.input, arguments.output), indent=2))
