"""Three real-source writing scenarios for the bundled DOCX Skill."""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import statistics
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


if len(sys.argv) != 2:
    raise SystemExit("Usage: python run_scenarios.py OUTPUT_DIRECTORY")
ROOT = Path(sys.argv[1]).resolve()
FIXTURES = Path(__file__).resolve().parent / "data"
TEMPLATE = (
    Path(__file__).resolve().parents[2]
    / "resources/skills/docx-generation/assets/python-docx-scientific-template.py"
)
spec = importlib.util.spec_from_file_location("scientific_docx_template", TEMPLATE)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
Report = module.ScientificDocxReport


def read_iris():
    rows = []
    source = FIXTURES / "iris.data"
    for record in csv.reader(source.open(encoding="utf-8")):
        if not record:
            continue
        rows.append(
            {
                "sepal_length": float(record[0]),
                "sepal_width": float(record[1]),
                "petal_length": float(record[2]),
                "petal_width": float(record[3]),
                "species": record[4].replace("Iris-", ""),
            }
        )
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    assert digest == "6f608b71a7317216319b4d27b4d9bc84e6abd734eda7872b71a458569e2656c0"
    assert len(rows) == 150
    assert {
        label: sum(row["species"] == label for row in rows)
        for label in {row["species"] for row in rows}
    } == {"setosa": 50, "versicolor": 50, "virginica": 50}
    return rows, digest


def scatter(rows, output):
    image = Image.new("RGB", (1600, 970), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 29)
    small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 23)
    left, top, right, bottom = 150, 95, 1210, 800
    x_min, x_max, y_min, y_max = 0, 7.5, 0, 2.7

    def xy(length, width):
        return (
            left + (length - x_min) / (x_max - x_min) * (right - left),
            bottom - (width - y_min) / (y_max - y_min) * (bottom - top),
        )

    for x in range(0, 8):
        px, _ = xy(x, 0)
        draw.line((px, top, px, bottom), fill="#E5EBEF", width=2)
        draw.text((px - 8, bottom + 18), str(x), fill="#283843", font=small)
    for tenth in range(0, 28, 5):
        y = tenth / 10
        _, py = xy(0, y)
        draw.line((left, py, right, py), fill="#E5EBEF", width=2)
        draw.text((55, py - 14), f"{y:.1f}", fill="#283843", font=small)
    draw.line((left, top, left, bottom, right, bottom), fill="#283843", width=3)
    palette = {"setosa": "#087F8C", "versicolor": "#D88C4A", "virginica": "#725AA6"}
    for row in rows:
        x, y = xy(row["petal_length"], row["petal_width"])
        color = palette[row["species"]]
        draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill=color, outline="white", width=2)
    draw.text((455, 866), "Petal length (cm)", fill="#16232E", font=font)
    draw.text((34, 43), "Petal width (cm)", fill="#16232E", font=font)
    for index, (species, color) in enumerate(palette.items()):
        y = 215 + index * 70
        draw.ellipse((1280, y, 1300, y + 20), fill=color)
        draw.text((1314, y - 2), species, fill="#16232E", font=small)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def chinese_review():
    output = ROOT / "outputs/01-中文定向文献综述.docx"
    report = Report(
        output,
        "黄河中游新石器时代证据的跨学科边界",
        language="zh",
        subtitle="三项开放获取研究的定向叙述性综述",
        metadata_line="文献截止 2026 年 9 月 25 日    文献类型 原始研究三篇",
    )
    report.add_front_matter()
    report.heading("摘要")
    report.paragraph(
        "【背景】黄河流域新石器时代材料常被连结为农业起源、人口迁徙和语言扩散的单一叙事，"
        "但这些问题使用的证据单位并不相同。【目的】比较三项可核查的原始研究各自能支持的结论。"
        "【方法】按遗址或语言样本、测量对象、年代与推断层级提取结果；本研究是定向叙述性综述，"
        "没有完整中文发掘报告检索，故不作系统综述或区域普遍性判断。【结果】唐户遗址的植硅体"
        "支持一处遗址的粟稻并见；甘肃和四川三处遗址的陶器微体化石及考古背景支持对西南迁徙路线"
        "的特定解释；语言系统发生分析支持的是语言分化模型，而非某遗址人口连续性的直接测量。"
        "【结论】把遗址观察、区域外推和跨学科模型明确分层，可保留这些研究的贡献，同时避免"
        "把模型一致性写成独立验证。"
    )
    report.heading("1 研究问题")
    report.paragraph(
        "本文问的是三个层级之间的边界：一处遗址观察到的作物组合，能否代表黄河中游所有同期聚落；"
        "沿线遗址的物质文化相似性，能否直接证明语言传播；语言谱系模型的年代估计，能否独立证明"
        "考古学所述的人群迁徙。三种资料可以相互启发，但不存在无需检验的等价关系。"
    )
    report.heading("2 资料与方法")
    report.paragraph(
        "选取 Zhang 等人 2012 年发表于 PLOS ONE 的唐户遗址植硅体论文、Liu 等人 2022 年发表于"
        "PNAS 的迁徙研究，以及 Zhang 等人 2019 年发表于 Nature 的汉藏语系统发生分析。"
        "逐篇核查题名、完整作者、DOI、研究单位、所用资料及原文结论。该取样用于比较证据类型，"
        "并非检索全部相关著作；因此不能估计领域共识的比例，也不能声称涵盖中文考古原始材料。"
    )
    report.heading("3 证据对照")
    report.table(
        [
            ["研究", "直接资料", "较稳妥的结论", "主要外推限制"],
            [
                "唐户 2012",
                "H92 等样品中的植硅体",
                "一处遗址约 7800 cal. yr BP 的粟稻并见",
                "不代表所有同期聚落",
            ],
            [
                "迁徙 2022",
                "三处遗址陶器微体化石与区域背景",
                "与西南方向迁徙解释相容",
                "物质相似性并非语言的直接观测",
            ],
            [
                "语言 2019",
                "109 种语言的比较资料与模型",
                "模型支持黄河流域起源假说",
                "模型年代不是遗址测年",
            ],
        ],
        caption="表 1 三项研究的资料单位与外推边界。结论强度按本文对原文的限定性阅读表述。",
        widths_mm=[27, 43, 48, 45],
    )
    report.paragraph(
        "唐户论文在 H92 样品中报告了稻与黍类植硅体共同出现，并把样品年代置于约 7800 cal. yr BP。"
        "作者同时说明了早期植物材料数量的局限。因而最直接的证据单位是唐户特定地层和样品；"
        "若要把这一结果提升为区域农业制度，需要更多同期遗址和可比采样。"
    )
    report.paragraph(
        "PNAS 研究把三处遗址陶器微体化石、区域考古背景与民族志类比放在一起，提出与向西南迁徙"
        "相容的解释。其不同证据流并非同一物理量。陶器残留物可回答使用和加工活动，遗址间相似性"
        "可提出接触或迁移假说，却不能单独把某一语言直接归给出土陶器。"
    )
    report.paragraph(
        "Nature 研究从语言比较资料估计汉藏语分化时间及起源模型。它与北方起源叙事存在可讨论的"
        "一致性，但其输入是语言特征和模型假设，而不是唐户或其他单一遗址的作物、骨骼或人群测量。"
        "若把不同学科的估计叠加成“已证实的连续链条”，会掩盖资料单位与不确定性的差异。"
    )
    report.heading("4 讨论与限度")
    report.paragraph(
        "三篇论文共同显示黄河流域相关问题需要多类资料，但不能因此合并其推断层级。更强的研究"
        "设计应预先规定待比较的遗址、时间窗和资料类型，统一测年与采样质量标准，并纳入中文发掘"
        "报告和考古简报。对迁徙与语言的联系，尤其需要区别文化传播、人口流动以及语言替换等竞争"
        "解释。本样本选择了开放获取论文，存在明显的语言和来源偏倚；其目的仅是检验方法与写作边界。"
    )
    report.heading("5 结论")
    report.paragraph(
        "唐户植硅体、沿线陶器微体化石和语言谱系分析各自支持有价值但范围不同的结论。"
        "下一轮完整综述必须补齐中文原始考古文献、可复核的纳排记录和逐项证据定位，"
        "之后才有基础评价区域模式与长期历史影响。"
    )
    report.heading("参考文献")
    report.reference(
        "Zhang, J., Lu, H., Gu, W., Wu, N., Zhou, K., Hu, Y., Xin, Y., & Wang, C. (2012). "
        "Early mixed farming of millet and rice 7800 years ago in the Middle Yellow River region, China. "
        "PLOS ONE, 7(12), e52146.",
        doi="10.1371/journal.pone.0052146",
    )
    report.reference(
        "Liu, L., Chen, J., Wang, J., Zhao, Y., & Chen, X. (2022). Archaeological evidence for initial "
        "migration of Neolithic Proto Sino-Tibetan speakers from Yellow River valley to Tibetan Plateau. "
        "Proceedings of the National Academy of Sciences, 119(51), e2212006119.",
        doi="10.1073/pnas.2212006119",
    )
    report.reference(
        "Zhang, M., Yan, S., Pan, W., & Jin, L. (2019). Phylogenetic evidence for Sino-Tibetan origin "
        "in northern China in the Late Neolithic. Nature, 569, 112–115.",
        doi="10.1038/s41586-019-1153-z",
    )
    return report.build()


def english_data_report(rows, digest, chart):
    output = ROOT / "outputs/02-English-data-report.docx"
    by_species = defaultdict(list)
    for row in rows:
        by_species[row["species"]].append(row)
    stats = {
        species: (
            len(group),
            statistics.mean(x["petal_length"] for x in group),
            statistics.stdev(x["petal_length"] for x in group),
        )
        for species, group in sorted(by_species.items())
    }
    report = Report(
        output,
        "Descriptive comparison of petal measurements in the UCI Iris dataset",
        language="en",
        subtitle="A reproducible data analysis note",
        metadata_line="Data source: UCI Machine Learning Repository   |   Downloaded 25 September 2026",
    )
    report.add_front_matter()
    report.heading("Abstract")
    report.paragraph(
        "Background: The Iris dataset is a compact benchmark for checking whether a report preserves "
        "the connection between a public data snapshot, a computed table and a figure. Objective: We "
        "described petal measurements across the three recorded species without fitting a predictive "
        "model. Methods: The 150 source rows were parsed as four measurements in centimetres and one "
        "species label. Means and sample standard deviations were computed within each recorded class. "
        "Results: Each class contained 50 rows. Mean petal length ranged from 1.46 cm in setosa to "
        "5.55 cm in virginica. Conclusion: The classes differ descriptively in this convenience dataset; "
        "these summaries do not estimate field-population effects or establish a causal mechanism."
    )
    report.heading("1 Introduction")
    report.paragraph(
        "The UCI Iris collection contains 150 observations, divided equally among setosa, versicolor "
        "and virginica. Its small size makes it useful for a fully auditable document-generation test: "
        "the input file, group counts, descriptive statistics and displayed points can all be checked "
        "without a hidden database or a model trained elsewhere. The scientific question here is narrow: "
        "how do recorded petal lengths and widths vary by the species labels in this public snapshot? "
        "The analysis is descriptive and was not designed to infer ecological adaptation or diagnostic accuracy."
    )
    report.heading("2 Methods")
    report.paragraph(
        "The file iris.data was downloaded from the UCI repository on 25 September 2026. Its SHA-256 "
        f"checksum is {digest}. Blank terminal lines were discarded. Each remaining line contains "
        "sepal length, sepal width, petal length and petal width in centimetres, followed by a species "
        "label. We required 150 complete rows and three groups of 50 before computing summaries. "
        "For each group, we calculated the arithmetic mean and sample standard deviation of petal "
        "length. The scatter plot uses the unmodified petal length and width of every row. We made no "
        "imputation, outlier exclusion, hypothesis test, confidence interval or multiple-comparison claim."
    )
    report.paragraph(
        "The analysis unit was one archived record, which UCI identifies as a plant; the file does "
        "not identify a field site or collection campaign. We checked the numeric range of every measurement, "
        "the absence of missing values and the three class counts before creating any display. "
        "The table and scatter plot were then generated directly from the same parsed rows, so their "
        "values do not depend on a second manual transcription. We kept the UCI labels as recorded; "
        "their taxonomic or sampling provenance was not independently verified. This separation "
        "between a reproducible file-level description and a biological claim is essential to the "
        "interpretation of the results."
    )
    report.heading("3 Results")
    report.paragraph(
        "All 150 parsed rows met the completeness rule, and the three species labels each appeared 50 "
        "times. Table 1 gives the group summaries. These are summaries of the archived observations, "
        "not estimates adjusted for site, observer or sampling design. In the figure, setosa occupies a "
        "shorter-petal region than the other labels, while versicolor and virginica overlap. The overlap "
        "matters: a mean contrast does not imply that every individual can be separated by one measure."
    )
    table_rows = [["Recorded species", "Rows, n", "Mean petal length (cm)", "SD (cm)"]]
    for species, (n, mean, sd) in stats.items():
        table_rows.append([species, n, f"{mean:.2f}", f"{sd:.2f}"])
    report.table(
        table_rows,
        caption="Table 1. Petal length by recorded species. SD is the sample standard deviation; no rows were excluded.",
        widths_mm=[49, 24, 55, 30],
    )
    report.figure(
        chart,
        "Figure 1. Petal length versus petal width for all 150 UCI Iris observations. Each point is one "
        "row; colour denotes the recorded species. Both axes are in centimetres. Points can overlap.",
        width_mm=120,
    )
    report.heading("4 Discussion")
    report.paragraph(
        "The descriptive separation is consistent with the familiar use of the dataset as a teaching "
        "example, but this analysis should not be treated as a validation study. The observations are "
        "not a probability sample of wild iris populations, and their original collection conditions "
        "are not encoded in the five-column file. The summary also deliberately avoids a classifier: "
        "its output is a table and a plot, not an estimate of out-of-sample predictive performance."
    )
    report.paragraph(
        "Reproducibility depends on the precise archived file. The UCI record notes a correction to "
        "individual measurements, so a copy from another package may differ. Reporting the file hash "
        "and the group rule makes this result auditable. A stronger biological interpretation would "
        "require a sampling design, collection metadata and an analysis plan beyond this small benchmark."
    )
    report.paragraph(
        "Because the archive provides no site, date or observer variable in this five-column "
        "snapshot, we cannot quantify between-site variation, measurement error or any effect of "
        "selection into the archive. Nor do the class summaries provide uncertainty for a defined "
        "external population: the standard deviations in Table 1 describe only the rows present. "
        "The overlap in Figure 1 also cautions against treating a species-level mean as a rule for "
        "classifying each record. These limitations would remain even if a nominal significance "
        "test were added; a small p-value could not supply missing sampling information."
    )
    report.paragraph(
        "A follow-up study could predefine a population, collect sampling and measurement metadata, "
        "and report uncertainty for a scientifically meaningful estimand. If prediction were the "
        "goal, a separate test set or a defensible cross-validation design would be necessary, with "
        "all preprocessing confined to the training folds. Those steps are outside the present "
        "descriptive exercise. Here, the value is an explicit chain from a public input file to "
        "numbers in a table and points in a figure, with the interpretation limited to that chain."
    )
    report.heading("5 Conclusion")
    report.paragraph(
        "Within the downloaded UCI snapshot, petal measurements differ descriptively among the three "
        "recorded classes, with visible overlap between two of them. The result illustrates a clear "
        "source-to-table-to-figure chain while remaining limited to the archived observations."
    )
    report.heading("Data and code availability")
    report.paragraph(
        "The input file and the script that generated this report are stored with the test record. "
        "The calculation uses Python's csv and statistics modules. The figure is generated from the "
        "same parsed rows; no independent transcription of numeric values was used."
    )
    report.heading("Reference")
    report.reference(
        "Fisher, R. (1936). Iris [Dataset]. UCI Machine Learning Repository.",
        doi="10.24432/C56C76",
    )
    return report.build(), stats


def mixed_methods(rows, stats, chart):
    output = ROOT / "outputs/03-中英混排方法附录.docx"
    report = Report(
        output,
        "Iris 数据处理与图表复核附录",
        language="mixed",
        subtitle="中英混排的可编辑方法文档",
        metadata_line="输入 150 条记录    |    单位 cm    |    数据来源 UCI Iris",
    )
    report.add_front_matter()
    report.heading("资料范围")
    report.paragraph(
        "本附录检验英文属名、中文说明、数值、表格和插图在同一份 Word 文档中的排版。"
        "数据与英文报告使用同一个 iris.data 快照；不添加额外观测或统计推断。"
        "The analysis keeps the original four measurement columns and species labels."
    )
    report.heading("变量与处理规则")
    report.paragraph(
        "将每条记录的 sepal length、sepal width、petal length、petal width 解析为浮点数，"
        "将 species 作为原始分组标签。空白末行不视为一条样本；任何数据行缺列都应终止分析。"
        "组内标准差使用样本分母 n−1。没有对测量值作标准化、填补或异常值删除。"
    )
    variables = [
        ("sepal length", "萼片长度"),
        ("sepal width", "萼片宽度"),
        ("petal length", "花瓣长度"),
        ("petal width", "花瓣宽度"),
    ]
    table_rows = [["Species", "Variable / 变量", "n", "Mean ± SD (cm)"]]
    for species in sorted(stats):
        group = [row for row in rows if row["species"] == species]
        for key, chinese in variables:
            values = [row[key.replace(" ", "_")] for row in group]
            table_rows.append(
                [
                    species,
                    f"{key} / {chinese}",
                    len(values),
                    f"{statistics.mean(values):.2f} ± {statistics.stdev(values):.2f}",
                ]
            )
    report.table(
        table_rows,
        caption="表 1 四项测量在各类别中的描述性统计。n 为记录数；SD 使用样本标准差。",
        widths_mm=[34, 56, 16, 54],
    )
    report.heading("图表与一致性检查")
    report.paragraph(
        "下图与英文正文共用同一张输入图，因此图中每个点的横纵坐标都来自表格所汇总的原始行。"
        "图仅描绘 petal length 和 petal width；不能从其视觉间距直接得出统计显著性。"
        "在中英混排环境下检查数字、括号、百分号与 DOI 换行，尤其注意中文标点周围不能出现异常大空格。"
    )
    report.figure(
        chart,
        "图 1 三类鸢尾花瓣长度与宽度散点图。数据为全部 150 条记录；坐标单位均为 cm。",
        width_mm=148,
    )
    report.heading("复核记录与解释界限")
    report.paragraph(
        "表中每个 n 都应等于该类别的原始行数，而不能等于去重后的坐标数：多条记录可以拥有相同的"
        "花瓣长度和宽度，因此图上的可见点数可能少于 150。均值与标准差从每个类别的 50 条记录"
        "重新计算，图轴范围在生成前固定，避免自动缩放造成视觉比较失真。检查者可从 iris.data"
        "逐行重建变量表，并对照英文报告的表 1 与图 1。中英文版本共用同一输入文件和图像，"
        "文字翻译不应改变任何数值、单位或分母。"
    )
    report.paragraph(
        "这个附录只记录文档生成和描述性统计的复核规则，不是鸢尾花分类模型的独立验证。"
        "原始文件没有采样地点、时间、测量者和测量误差字段，因而无法从这些行推断野外总体"
        "差异、因果机制或临床式诊断性能。若后续工作拟比较总体均值，应先确定抽样框、目标"
        "参数和不确定性估计方法；若拟建立预测模型，则还应规定训练与测试数据的隔离。"
        "把这些未做的步骤写清楚，可以防止精致的图表掩盖证据边界。"
    )
    report.heading("数据出处")
    report.reference(
        "Fisher, R. (1936). Iris [Dataset]. UCI Machine Learning Repository.",
        doi="10.24432/C56C76",
    )
    return report.build()


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    rows, digest = read_iris()
    chart = ROOT / "figures/iris-petal-scatter.png"
    scatter(rows, chart)
    chinese = chinese_review()
    english, stats = english_data_report(rows, digest, chart)
    mixed = mixed_methods(rows, stats, chart)
    for path in (chinese, english, mixed):
        print(path)


if __name__ == "__main__":
    main()
