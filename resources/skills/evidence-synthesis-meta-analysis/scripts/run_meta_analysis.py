#!/usr/bin/env python3
"""Audited aggregate-data, one-effect-per-cohort random-effects meta-analysis.

Requires scipy, numpy and matplotlib. REML, ad-hoc Hartung–Knapp intervals,
prediction intervals, leave-one-out, and descriptive small-study diagnostics.
"""

import argparse
import csv
import hashlib
import json
import math
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
import numpy as np
from scipy.optimize import minimize_scalar
from scipy.stats import linregress, norm, t


FIELDS = ("study_id", "cohort_id", "study", "year", "measure", "effect",
          "ci_lo", "ci_hi", "se", "n_trt", "n_ctrl", "subgroup", "design",
          "source_id", "source_url", "snapshot", "page", "verbatim", "verified_by")
MEASURES = {"MD", "SMD", "OR", "RR", "HR"}
RATIOS = {"OR", "RR", "HR"}
NUMBER = re.compile(r"(?<![A-Za-z0-9])[-−]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def safe_path(root, relative):
    if not relative or Path(relative).is_absolute():
        raise ValueError(f"Unsafe source snapshot path: {relative}")
    raw = root
    for part in Path(relative).parts:
        if part == "..":
            raise ValueError(f"Unsafe source snapshot path: {relative}")
        raw = raw / part
        if raw.is_symlink():
            raise ValueError(f"Symbolic links are not allowed in source snapshots: {relative}")
    path = raw.resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f"Unsafe or missing source snapshot: {relative}")
    return path


def positive_float(value, name, allow_zero=False):
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be numeric") from None
    if not math.isfinite(number) or (number < 0 if allow_zero else number <= 0):
        raise ValueError(f"{name} must be {'nonnegative' if allow_zero else 'positive'} and finite")
    return number


def quote_has_number(numbers, target):
    return any(math.isclose(item, target, rel_tol=1e-5, abs_tol=1e-6) for item in numbers)


def load(config_path, extraction_path):
    config_path, extraction_path = Path(config_path), Path(extraction_path)
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if config.get("schema_version") != 1 or config.get("measure") not in MEASURES:
        raise ValueError("Unsupported config schema or effect measure")
    if config.get("language", "en") not in ("en", "zh"):
        raise ValueError("language must be en or zh")
    if config.get("review_type") not in ("narrative", "scoping", "systematic"):
        raise ValueError("review_type must be narrative, scoping, or systematic")
    for key in ("question", "outcome", "direction", "analysis_population"):
        if not isinstance(config.get(key), str) or not config[key].strip():
            raise ValueError(f"Missing config field {key}")
    root = extraction_path.parent.resolve()
    with extraction_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or any(name not in reader.fieldnames for name in FIELDS):
            raise ValueError("Extraction table does not match the required column contract")
        rows = list(reader)
    if len(rows) < 3:
        raise ValueError("At least three independent studies are required for this random-effects route")
    seen_studies, seen_cohorts, designs, subgroups = set(), set(), set(), set()
    prepared = []
    for index, row in enumerate(rows, 1):
        label = f"row {index}"
        for key in ("study_id", "cohort_id", "study", "source_id", "source_url",
                    "snapshot", "verbatim", "verified_by", "design", "subgroup"):
            if not row.get(key) or not row[key].strip():
                raise ValueError(f"{label} missing {key}")
        if row["study_id"] in seen_studies or row["cohort_id"] in seen_cohorts:
            raise ValueError(f"Duplicate study or cohort in {label}; dependent effects need another model")
        seen_studies.add(row["study_id"])
        seen_cohorts.add(row["cohort_id"])
        designs.add(row["design"])
        subgroups.add(row["subgroup"])
        if row["measure"] != config["measure"]:
            raise ValueError(f"Mixed or mismatched effect measures at {label}")
        try:
            year, page, n_trt, n_ctrl = [int(row[key]) for key in ("year", "page", "n_trt", "n_ctrl")]
        except (TypeError, ValueError):
            raise ValueError(f"{label} has invalid year, page, or sample size") from None
        if not 1800 <= year <= 2100 or page < 1 or n_trt < 1 or n_ctrl < 1:
            raise ValueError(f"{label} has invalid year, page, or sample size")
        effect = float(row["effect"])
        lo, hi = float(row["ci_lo"]), float(row["ci_hi"])
        if not all(map(math.isfinite, (effect, lo, hi))) or not lo < effect < hi:
            raise ValueError(f"{label} has an invalid effect or 95% interval")
        if config["measure"] in RATIOS and lo <= 0:
            raise ValueError(f"{label} ratio effect and CI must be positive")
        snapshot = safe_path(root, row["snapshot"])
        pages = [json.loads(line) for line in snapshot.read_text(encoding="utf-8").splitlines() if line.strip()]
        text = next((item.get("text") for item in pages if item.get("page") == page), None)
        if not isinstance(text, str) or row["verbatim"] not in text:
            raise ValueError(f"{label} verbatim quote is absent from the stated page")
        numbers = [float(x.replace("−", "-")) for x in NUMBER.findall(row["verbatim"])]
        if not all(quote_has_number(numbers, x) for x in (effect, lo, hi)):
            raise ValueError(f"{label} effect or interval cannot be recovered from verbatim quote")
        y, low, high = (math.log(effect), math.log(lo), math.log(hi)) if config["measure"] in RATIOS else (effect, lo, hi)
        derived_se = (high - low) / (2 * norm.ppf(0.975))
        if row.get("se"):
            se = positive_float(row["se"], f"{label} SE")
            if not math.isclose(se, derived_se, rel_tol=0.05):
                raise ValueError(f"{label} SE does not match the 95% interval")
        else:
            se = derived_se
        prepared.append({**row, "year": year, "page": page, "n_trt": n_trt,
                         "n_ctrl": n_ctrl, "raw_effect": effect, "raw_ci": [lo, hi],
                         "yi": y, "sei": se, "vi": se * se,
                         "snapshot_sha256": sha(snapshot)})
    if len(designs) != 1 or len(subgroups) != 1:
        raise ValueError("Mixed designs or subgroups need prespecified stratified analyses")
    if config["review_type"] == "systematic":
        screening = root / "screening_log.csv"
        if not screening.is_file():
            raise ValueError("Systematic review needs screening_log.csv")
        with screening.open(newline="", encoding="utf-8-sig") as handle:
            entries = list(csv.DictReader(handle))
        if not entries or any(not x.get("source_id") or x.get("decision") not in ("include", "exclude")
                              or not x.get("reason") for x in entries):
            raise ValueError("Screening log lacks decisions or reasons")
    return config, prepared


def configure_plot_font(config):
    if config.get("language", "en") == "en":
        plt.rcParams["font.family"] = "DejaVu Sans"
        return
    candidates = ([Path(config["font_path"])] if config.get("font_path") else [
        Path("/Library/Fonts/Arial Unicode.ttf"),
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
    ])
    font_path = next((path for path in candidates if path.is_file()), None)
    if font_path is None:
        raise ValueError("Chinese figures need a CJK font; set config.font_path")
    font_manager.fontManager.addfont(str(font_path))
    plt.rcParams["font.family"] = font_manager.FontProperties(fname=str(font_path)).get_name()
    plt.rcParams["axes.unicode_minus"] = False


def fit(yi, vi):
    yi, vi = np.asarray(yi, dtype=float), np.asarray(vi, dtype=float)
    k = len(yi)
    if k < 2 or np.any(vi <= 0):
        raise ValueError("Meta-analysis requires at least two valid effects")
    def objective(tau2):
        w = 1 / (vi + tau2)
        mu = np.sum(w * yi) / np.sum(w)
        return 0.5 * (np.log(vi + tau2).sum() + math.log(w.sum())
                      + np.sum(w * (yi - mu) ** 2))
    upper = max(1.0, float(np.var(yi) * 10), float(np.max(vi) * 10))
    optimized = minimize_scalar(objective, bounds=(0, upper), method="bounded",
                                options={"xatol": 1e-12})
    if not optimized.success:
        raise ValueError("REML optimization did not converge")
    tau2 = max(0.0, float(optimized.x)) if optimized.fun < objective(0) else 0.0
    w = 1 / (vi + tau2)
    mu = float(np.sum(w * yi) / np.sum(w))
    q_re = float(np.sum(w * (yi - mu) ** 2))
    se_wald = float(math.sqrt(1 / sum(w)))
    se_hk = se_wald * math.sqrt(max(1.0, q_re / (k - 1)))
    critical = float(t.ppf(0.975, k - 1))
    w_fe = 1 / vi
    mu_fe = float(np.sum(w_fe * yi) / np.sum(w_fe))
    q = float(np.sum(w_fe * (yi - mu_fe) ** 2))
    i2 = max(0.0, (q - (k - 1)) / q) if q > 0 else 0.0
    pi_critical = float(t.ppf(0.975, k - 2)) if k >= 3 else None
    return {"k": k, "mu": mu, "se_hk": se_hk, "tau2": tau2, "i2": i2,
            "q": q, "ci": [mu - critical * se_hk, mu + critical * se_hk],
            "pi": [mu - pi_critical * math.sqrt(tau2 + se_hk ** 2),
                   mu + pi_critical * math.sqrt(tau2 + se_hk ** 2)] if pi_critical else None}


def influence_diagnostics(yi, vi, model):
    """Conditional WLS diagnostics with the full model's REML tau² held fixed.

    These descriptive one-parameter diagnostics flag studies for investigation;
    estimating tau² again after deletion can change their values and ranking.
    """
    yi, vi = np.asarray(yi, dtype=float), np.asarray(vi, dtype=float)
    weights = 1 / (vi + model["tau2"])
    leverage = weights / weights.sum()
    residual = (yi - model["mu"]) / np.sqrt((vi + model["tau2"]) * (1 - leverage))
    cook = residual ** 2 * leverage / (1 - leverage)
    return [{"leverage_fixed_tau2": float(leverage[i]),
             "studentized_residual_fixed_tau2": float(residual[i]),
             "cook_d_fixed_tau2": float(cook[i])} for i in range(len(yi))]


def figure(path, draw):
    fig, ax = plt.subplots(figsize=(8.2, 5.1), dpi=180)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("#fafafa")
    draw(ax)
    fig.tight_layout(pad=1.5)
    fig.savefig(str(path) + ".svg")
    fig.savefig(str(path) + ".png", dpi=180)
    plt.close(fig)


def run(config_path, extraction_path, output_dir):
    config_path, extraction_path, output_dir = map(Path, (config_path, extraction_path, output_dir))
    config, rows = load(config_path, extraction_path)
    configure_plot_font(config)
    zh = config.get("language", "en") == "zh"
    y = np.array([r["yi"] for r in rows])
    se = np.array([r["sei"] for r in rows])
    fit_all = fit(y, se ** 2)
    influence = influence_diagnostics(y, se ** 2, fit_all)
    for row, diagnostic in zip(rows, influence):
        diagnostic["study_id"] = row["study_id"]
    ratio = config["measure"] in RATIOS
    back = math.exp if ratio else float
    loo = []
    for index, row in enumerate(rows):
        sub = fit(np.delete(y, index), np.delete(se ** 2, index))
        loo.append({"omitted_study_id": row["study_id"], "pooled_effect": back(sub["mu"]),
                    "ci": [back(x) for x in sub["ci"]],
                    "standardized_shift": abs(fit_all["mu"] - sub["mu"]) / fit_all["se_hk"]})
    egger = {"status": "not_interpretable_k_lt_10"} if len(rows) < 10 else {"status": "not_run"}
    if len(rows) >= 10:
        if ratio:
            egger = {"status": "measure_specific_method_required"}
        elif max(se) / min(se) < 1.5:
            egger = {"status": "insufficient_size_spread"}
        else:
            regression = linregress(1 / se, y / se)
            egger = {"status": "exploratory_small_study_effects", "intercept": regression.intercept,
                     "p_value": regression.intercept_stderr and float(
                         2 * t.sf(abs(regression.intercept / regression.intercept_stderr), len(rows) - 2))}
    result = {"schema_version": 1, "language": "zh" if zh else "en",
              "question": config["question"], "outcome": config["outcome"],
              "measure": config["measure"], "direction": config["direction"],
              "k": len(rows), "pooled_effect": back(fit_all["mu"]),
              "confidence_interval_95": [back(x) for x in fit_all["ci"]],
              "prediction_interval_95": [back(x) for x in fit_all["pi"]],
              "tau2_analysis_scale": fit_all["tau2"], "tau_analysis_scale": math.sqrt(fit_all["tau2"]),
              "i2": fit_all["i2"], "q": fit_all["q"], "model": "random-effects REML",
              "interval_method": "ad-hoc Hartung–Knapp (SE floor at Wald, t with k-1 df)",
              "prediction_method": "t with k-2 df; sqrt(tau2 + adjusted summary SE^2)",
              "analysis_scale": "natural log" if ratio else "reported effect scale",
              "leave_one_out": loo, "influence": influence, "egger": egger,
              "config_sha256": sha(config_path), "extraction_sha256": sha(extraction_path),
              "snapshot_sha256": {r["source_id"]: r["snapshot_sha256"] for r in rows},
              "limitations": ["One effect per independent cohort; shared controls and repeated measures need multilevel methods.",
                              "Reported normal-approximation 95% study intervals are used to derive SE.",
                              "REML and prediction intervals can be unstable with few studies or extreme heterogeneity.",
                              "Cook's D and studentized residuals hold the full-fit REML tau² fixed; they flag studies for investigation, not automatic exclusion.",
                              "A funnel plot or Egger test does not diagnose publication bias by itself."]}
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "meta-result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    labels = [r["study"] for r in rows]
    axis_effect = np.array([r["raw_effect"] for r in rows])
    axis_lo = np.array([r["raw_ci"][0] for r in rows])
    axis_hi = np.array([r["raw_ci"][1] for r in rows])
    null = 1 if ratio else 0
    def forest(ax):
        ypos = np.arange(len(rows), 0, -1)
        ax.errorbar(axis_effect, ypos, xerr=[axis_effect-axis_lo, axis_hi-axis_effect],
                    fmt="o", color="#0f766e", ecolor="#0f766e", capsize=3)
        ax.errorbar([result["pooled_effect"]], [0], xerr=[[result["pooled_effect"]-result["confidence_interval_95"][0]],
                    [result["confidence_interval_95"][1]-result["pooled_effect"]]],
                    fmt="D", color="#be123c", capsize=4)
        ax.axvline(null, color="#475569", linestyle="--", linewidth=1)
        ax.set_yticks(list(ypos)+[0], labels+(["合并效应（REML）"] if zh else ["Pooled (REML)"]))
        ax.set_xlabel(config["measure"] + (("（对数坐标）" if zh else " (log-scaled axis)") if ratio else ""))
        if ratio: ax.set_xscale("log")
        ax.set_title("各研究效应量与 95% 置信区间" if zh else "Study effects and 95% confidence intervals")
    figure(output_dir / "forest", forest)
    def funnel(ax):
        ax.scatter(y, se, color="#0f766e", s=45)
        ax.axvline(fit_all["mu"], color="#be123c", linestyle="--")
        ax.invert_yaxis()
        ax.set_xlabel("分析尺度上的效应量" if zh else "Effect on analysis scale")
        ax.set_ylabel("标准误（下方为较小研究）" if zh else "Standard error (smaller studies below)")
        ax.set_title("描述性漏斗图：不对称不等于偏倚" if zh else "Descriptive funnel; asymmetry is not proof of bias")
        if len(rows) < 10: ax.text(0.02, 0.04, "k < 10：不进行不对称性检验" if zh else "k < 10: no asymmetry test", transform=ax.transAxes)
    figure(output_dir / "funnel", funnel)
    def loo_plot(ax):
        ypos = np.arange(len(loo), 0, -1)
        means = np.array([x["pooled_effect"] for x in loo])
        los = np.array([x["ci"][0] for x in loo])
        his = np.array([x["ci"][1] for x in loo])
        ax.errorbar(means, ypos, xerr=[means-los, his-means], fmt="o", color="#0f766e", capsize=3)
        ax.axvline(result["pooled_effect"], color="#be123c", linestyle="--")
        ax.set_yticks(ypos, [x["omitted_study_id"] for x in loo])
        ax.set_xlabel("剔除该研究后的合并效应" if zh else "Pooled effect after exclusion")
        if ratio: ax.set_xscale("log")
        ax.set_title("逐一排除敏感性分析：调查变化，不自动删除研究" if zh else "Leave-one-out stability; investigate shifts, do not auto-delete")
    figure(output_dir / "leave-one-out", loo_plot)
    def heterogeneity(ax):
        ax.axis("off")
        cells = [(("研究数" if zh else "Studies"), str(result["k"])), ("I²", f"{result['i2']:.1%}"),
                 ("τ", f"{result['tau_analysis_scale']:.3g}"),
                 (("合并效应" if zh else "Pooled effect"), f"{result['pooled_effect']:.3g}"),
                 (("95% 置信区间" if zh else "95% CI"), f"{result['confidence_interval_95'][0]:.3g} {'至' if zh else 'to'} {result['confidence_interval_95'][1]:.3g}"),
                 (("95% 预测区间" if zh else "95% prediction interval"), f"{result['prediction_interval_95'][0]:.3g} {'至' if zh else 'to'} {result['prediction_interval_95'][1]:.3g}")]
        for index, (label, value) in enumerate(cells):
            ax.text(0.06, 0.87-index*0.145, label, fontsize=12, color="#475569", transform=ax.transAxes)
            ax.text(0.58, 0.87-index*0.145, value, fontsize=13, color="#0f172a", transform=ax.transAxes)
        ax.set_title("异质性与区间汇总" if zh else "Heterogeneity and interval summary")
    figure(output_dir / "heterogeneity", heterogeneity)
    if zh:
        lines = [f"# {config['question']}", "", "## 方法", "",
                 f"结局：{config['outcome']}；效应指标：{config['measure']}；方向：{config['direction']}。", "",
                 f"分析人群：{config['analysis_population']}。每个独立队列仅纳入一个已核验效应量（k={len(rows)}）。", "",
                 "采用随机效应 REML 合并与经下限修正的 Hartung–Knapp 95% 置信区间；比值指标在自然对数尺度合并后回转换。", "",
                 "## 结果", "",
                 f"合并效应 {result['pooled_effect']:.3g}（95% 置信区间 {result['confidence_interval_95'][0]:.3g} 至 {result['confidence_interval_95'][1]:.3g}）；"
                 f"95% 预测区间 {result['prediction_interval_95'][0]:.3g} 至 {result['prediction_interval_95'][1]:.3g}。"
                 f"I²={result['i2']:.1%}；分析尺度上的 τ²={result['tau2_analysis_scale']:.3g}。", "",
                 f"小研究效应评估状态：{egger['status']}。漏斗图仅作描述，不据此声称存在发表偏倚。", "",
                 "## 逐项数据提取", "",
                 "| 研究 | 来源 | 效应量 | 95% 置信区间 | 干预组样本量 | 对照组样本量 |",
                 "| --- | --- | ---: | --- | ---: | ---: |"]
    else:
        lines = [f"# {config['question']}", "", "## Methods", "",
                 f"Outcome: {config['outcome']}; measure: {config['measure']}; direction: {config['direction']}.", "",
                 f"Population: {config['analysis_population']}. One verified effect per independent cohort (k={len(rows)}).",
                 "", "Random-effects REML with ad-hoc Hartung–Knapp 95% CI; ratio measures pooled on the natural-log scale and back-transformed.",
                 "", "## Results", "",
                 f"Pooled effect {result['pooled_effect']:.3g} (95% CI {result['confidence_interval_95'][0]:.3g} to {result['confidence_interval_95'][1]:.3g}); "
                 f"95% prediction interval {result['prediction_interval_95'][0]:.3g} to {result['prediction_interval_95'][1]:.3g}. "
                 f"I²={result['i2']:.1%}; τ²={result['tau2_analysis_scale']:.3g} on the analysis scale.", "",
                 f"Small-study assessment: {egger['status']}. A descriptive funnel plot is supplied without a publication-bias claim.",
                 "", "## Study-level extraction", "",
                 "| Study | Source | Effect | 95% CI | N treatment | N control |", "| --- | --- | ---: | --- | ---: | ---: |"]
    for row in rows:
        connector = "至" if zh else "to"
        lines.append(f"| {row['study']} ({row['year']}) | [{row['source_id']}]({row['source_url']}) | "
                     f"{row['raw_effect']:.3g} | {row['raw_ci'][0]:.3g} {connector} {row['raw_ci'][1]:.3g} | "
                     f"{row['n_trt']} | {row['n_ctrl']} |")
    lines += (["", "## 敏感性与影响诊断", "",
               "随附逐一排除结果和四张图。Cook's D 与学生化残差均固定完整模型估计的 REML τ²；异常研究需要调查，不应自动删除。", "",
               "| 研究 | 学生化残差 | Cook's D |", "| --- | ---: | ---: |"] if zh else
              ["", "## Sensitivity and influence", "",
               "Leave-one-out estimates and four figure files accompany this report. Conditional Cook's D and studentized residuals use the full-fit REML τ² held fixed; investigate unusual studies rather than deleting them automatically.", "",
               "| Study | Studentized residual | Cook's D |", "| --- | ---: | ---: |"])
    lines += [f"| {item['study_id']} | {item['studentized_residual_fixed_tau2']:.3g} | {item['cook_d_fixed_tau2']:.3g} |"
              for item in influence]
    if zh:
        lines += ["", "## 局限性", "",
                  "- 每个独立队列仅纳入一个效应量；共享对照或重复测量需要多层模型。",
                  "- 从原文报告的近似正态 95% 置信区间推导单项标准误。",
                  "- 研究数量少或异质性极高时，REML 与预测区间可能不稳定。",
                  "- Cook's D 和学生化残差固定完整模型的 REML τ²，只用于提示复核，不用于自动剔除。",
                  "- 漏斗图或 Egger 检验本身无法诊断发表偏倚。", "",
                  "本结果随附提取表、逐页原文快照、配置与哈希值；仍需人工解释和逐页检查图表。", ""]
    else:
        lines += ["", "## Limitations", ""]
        lines += [f"- {item}" for item in result["limitations"]]
        lines += ["", "The extraction table, page snapshots, configuration, and hashes are part of this result. Manual scientific interpretation and page-by-page figure review are still required.", ""]
    (output_dir / "meta-report.md").write_text("\n".join(lines), encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("config", "extraction", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    print(json.dumps(run(args.config, args.extraction, args.output), indent=2))
