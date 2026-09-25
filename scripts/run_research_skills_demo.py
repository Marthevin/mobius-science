#!/usr/bin/env python3
"""Render two explicitly synthetic bilingual Skill journeys through PDF/DOCX templates.

Development smoke test only. This is not a source of scientific conclusions.
Dependencies: scipy, numpy, matplotlib, reportlab, python-docx.
"""

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

from test_research_skills_journey import REPO, run_case


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


PDF = load_module("demo_pdf_template", REPO / "resources/skills/pdf-report-generation/assets/reportlab-scientific-template.py")
DOCX = load_module("demo_docx_template", REPO / "resources/skills/docx-generation/assets/python-docx-scientific-template.py")


def parts(markdown):
    for line in markdown.splitlines():
        line = line.strip()
        if not line or line.startswith("# "):
            continue
        if line.startswith("## "):
            yield "heading", line[3:]
        else:
            yield "paragraph", re.sub(r"\*\*(.*?)\*\*", r"\1", line)


def render(root, language):
    root = Path(root)
    proposal = json.loads((root / "proposal-input.json").read_text(encoding="utf-8"))
    source = (root / "proposal/proposal.md").read_text(encoding="utf-8")
    font = ("/Library/Fonts/Arial Unicode.ttf" if language == "zh" else
            "/System/Library/Fonts/Supplemental/Times New Roman.ttf")
    bold = (font if language == "zh" else
            "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf")
    report = PDF.ScientificReport(root / "proposal-demo.pdf", proposal["title"],
                                  font, bold, language=language,
                                  subtitle="SYNTHETIC WORKFLOW TEST — NOT RESEARCH EVIDENCE",
                                  metadata_line="Mobius Science · four-Skill integration smoke test")
    report.add_front_matter()
    word = DOCX.ScientificDocxReport(root / "proposal-demo.docx", proposal["title"],
                                     language=language,
                                     subtitle="SYNTHETIC WORKFLOW TEST — NOT RESEARCH EVIDENCE")
    word.add_front_matter()
    for kind, content in parts(source):
        if kind == "heading":
            report.heading(content)
            word.heading(content)
        elif content.startswith("- "):
            report.paragraph(content)
            word.paragraph(content)
        else:
            report.paragraph(content)
            word.paragraph(content)
    figure = root / "meta/forest.png"
    caption = ("图 1. 虚构四项研究的均值差与合并估计；不代表实证证据。" if language == "zh" else
               "Figure 1. Synthetic four-study mean differences and pooled estimate; not empirical evidence.")
    report.figure(figure, caption)
    word.figure(figure, caption)
    report.build()
    word.build()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--case", choices=("psychology", "archaeology"))
    args = parser.parse_args()
    if args.case is None:
        # ReportLab font registration is process-global; separate language runs
        # so a prior Latin registration cannot shadow a later CJK registration.
        for domain in ("psychology", "archaeology"):
            subprocess.run([sys.executable, str(Path(__file__).resolve()), str(args.output),
                            "--case", domain], check=True)
        return
    for language, domain in (("en", "psychology"), ("zh", "archaeology")):
        if domain != args.case:
            continue
        root = args.output / domain
        run_case(root, language, domain)
        render(root, language)
        print(root / "proposal-demo.pdf", root / "proposal-demo.docx")


if __name__ == "__main__":
    main()
