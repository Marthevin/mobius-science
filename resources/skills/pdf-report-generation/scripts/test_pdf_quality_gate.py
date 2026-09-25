#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

from pdf_quality_gate import (  # noqa: E402 - import the sibling script after adding its directory
    file_identity,
    inspect_doi_links,
    inspect_fonts,
    inspect_page_count,
    inspect_page_images,
    inspect_text,
)


def load_report_template():
    template_path = SCRIPT_DIR.parent / "assets" / "reportlab-scientific-template.py"
    spec = importlib.util.spec_from_file_location(
        "scientific_report_template", template_path
    )
    if not spec or not spec.loader:
        raise RuntimeError(f"Unable to load report template: {template_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reportlab_modules():
    try:
        import reportlab
        from reportlab.platypus import Paragraph
    except ImportError as exc:
        raise unittest.SkipTest("reportlab is unavailable") from exc
    return reportlab, Paragraph


class PdfQualityGateTests(unittest.TestCase):
    def test_chinese_route_rejects_zero_extracted_hanzi_without_a_length_floor(self) -> None:
        with patch("pdf_quality_gate.run", return_value="□□□ English text.\f"):
            _, metrics, findings = inspect_text(Path("report.pdf"), "zh", 0)
        self.assertEqual(metrics["cjk_characters"], 0)
        self.assertIn(("missing-cjk-text", "error"),
                      [(item.code, item.severity) for item in findings])

    def test_chinese_length_floor_counts_hanzi_instead_of_english_words(self) -> None:
        with patch("pdf_quality_gate.run", return_value="黄河中游遗址。\f"):
            _, metrics, findings = inspect_text(Path("report.pdf"), "zh", 6)

        self.assertEqual(metrics["cjk_characters"], 6)
        self.assertEqual(findings, [])

    def test_explicit_chinese_floor_works_for_mixed_reports(self) -> None:
        with patch(
            "pdf_quality_gate.run", return_value="English abstract. 黄河遗址。\f"
        ):
            _, _, findings = inspect_text(
                Path("report.pdf"), "mixed", 0, minimum_cjk_chars=6
            )

        self.assertEqual(
            [(item.code, item.severity) for item in findings],
            [("short-report-cjk", "warning")],
        )

    def test_doi_link_check_finds_visible_doi_without_matching_annotation(self) -> None:
        extracted = (
            "References: https://doi.org/10.1234/alpha and https://doi.org/10.2345/beta"
        )
        links = "Page  Type          URL\n   1  URI https://doi.org/10.1234/alpha\n"
        with patch("pdf_quality_gate.run", return_value=links):
            findings = inspect_doi_links(Path("report.pdf"), extracted)

        self.assertEqual(
            [(item.code, item.severity) for item in findings],
            [("unlinked-doi", "warning")],
        )
        self.assertIn("10.2345/beta", findings[0].message)

    def test_page_count_range_flags_report_outside_requested_bounds(self) -> None:
        too_long = inspect_page_count(12, minimum=9, maximum=10)
        too_short = inspect_page_count(7, minimum=9, maximum=10)

        self.assertEqual(
            [(item.severity, item.code) for item in too_long],
            [("warning", "too-many-pages")],
        )
        self.assertEqual(
            [(item.severity, item.code) for item in too_short],
            [("warning", "too-few-pages")],
        )

    def test_custom_bottom_blank_threshold_flags_visually_unbalanced_page(self) -> None:
        try:
            from PIL import Image, ImageDraw
        except ImportError as exc:
            raise unittest.SkipTest("Pillow is unavailable") from exc

        with tempfile.TemporaryDirectory() as temp_dir:
            page = Path(temp_dir) / "page-01.png"
            image = Image.new("RGB", (500, 1000), "white")
            ImageDraw.Draw(image).rectangle((35, 60, 465, 650), fill="black")
            image.save(page)

            _, findings = inspect_page_images([page], maximum_bottom_blank=0.25)

        self.assertEqual(
            [(item.severity, item.code, item.page) for item in findings],
            [("warning", "large-bottom-gap", 1)],
        )

    def test_file_identity_binds_qa_to_exact_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            candidate = Path(temp_dir) / "report.pdf"
            candidate.write_bytes(b"candidate revision")

            self.assertEqual(
                file_identity(candidate),
                {
                    "bytes": 18,
                    "sha256": (
                        "717b75d69a969a9b8174cd77989a30868b0168cd954c560a25b23d2f61f14df9"
                    ),
                },
            )

    @unittest.skipIf(shutil.which("pdffonts") is None, "pdffonts is unavailable")
    def test_report_template_embeds_fonts_for_bullets_and_tables(self) -> None:
        reportlab, Paragraph = reportlab_modules()
        template = load_report_template()
        reportlab_dir = Path(reportlab.__file__).parent
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "font-check.pdf"
            report = template.ScientificReport(
                output,
                "Font resource check",
                reportlab_dir / "fonts" / "Vera.ttf",
                reportlab_dir / "fonts" / "VeraBd.ttf",
            )
            report.add_front_matter()
            report.story.append(
                Paragraph("A bullet paragraph", report.styles["body"], bulletText="•")
            )
            report.table([["Field", "Value"], ["Evidence", "Embedded"]])
            report.build()

            fonts, findings = inspect_fonts(output)

        self.assertEqual(findings, [])
        self.assertTrue(fonts)
        self.assertTrue(all("Helvetica" not in font["name"] for font in fonts))

    def test_report_template_keeps_headerless_first_row_readable(self) -> None:
        reportlab, _ = reportlab_modules()
        template = load_report_template()
        reportlab_dir = Path(reportlab.__file__).parent
        with tempfile.TemporaryDirectory() as temp_dir:
            report = template.ScientificReport(
                Path(temp_dir) / "headerless.pdf",
                "Headerless table check",
                reportlab_dir / "fonts" / "Vera.ttf",
                reportlab_dir / "fonts" / "VeraBd.ttf",
            )
            report.table(
                [["Evidence", "Embedded"], ["Rows", "Readable"]], repeat_header=False
            )

            table = report.story[-2]
            self.assertFalse(
                any(command[0] == "BACKGROUND" for command in table._bkgrndcmds)
            )
            self.assertTrue(
                any(
                    command[0] == "ROWBACKGROUNDS" and command[1] == (0, 0)
                    for command in table._bkgrndcmds
                )
            )

    def test_small_table_and_caption_can_stay_together(self) -> None:
        reportlab, _ = reportlab_modules()
        from reportlab.platypus import KeepTogether

        template = load_report_template()
        reportlab_dir = Path(reportlab.__file__).parent
        with tempfile.TemporaryDirectory() as temp_dir:
            report = template.ScientificReport(
                Path(temp_dir) / "small-table.pdf",
                "Table grouping check",
                reportlab_dir / "fonts" / "Vera.ttf",
            )
            report.table(
                [["Period", "Evidence"], ["Early", "Farming"], ["Late", "Urbanism"]],
                caption="Table 1. Evidence by period.",
                keep_together=True,
            )

            self.assertIsInstance(report.story[-1], KeepTogether)
            self.assertEqual(len(report.story[-1]._content), 3)

    def test_chinese_report_styles_are_left_aligned_and_references_remain_legible(
        self,
    ) -> None:
        reportlab, _ = reportlab_modules()
        from reportlab.lib.enums import TA_LEFT

        template = load_report_template()
        reportlab_dir = Path(reportlab.__file__).parent
        with tempfile.TemporaryDirectory() as temp_dir:
            report = template.ScientificReport(
                Path(temp_dir) / "chinese.pdf",
                "黄河中游新石器时代遗址文献综述",
                reportlab_dir / "fonts" / "Vera.ttf",
                reportlab_dir / "fonts" / "VeraBd.ttf",
                language="zh",
            )

        self.assertEqual(report.styles["body"].alignment, TA_LEFT)
        self.assertEqual(report.styles["body"].wordWrap, "CJK")
        self.assertGreaterEqual(report.styles["reference"].fontSize, 9)

    def test_chinese_report_can_use_a_separate_embedded_reference_face(self) -> None:
        reportlab, _ = reportlab_modules()
        template = load_report_template()
        reportlab_dir = Path(reportlab.__file__).parent
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "mixed-font.pdf"
            report = template.ScientificReport(
                output,
                "Chinese review",
                reportlab_dir / "fonts" / "Vera.ttf",
                reportlab_dir / "fonts" / "VeraBd.ttf",
                language="zh",
                reference_font=reportlab_dir / "fonts" / "VeraIt.ttf",
            )
            self.assertEqual(report.styles["reference"].fontName, "ResearchReference")
            report.add_front_matter()
            report.reference("Author (2024). A paper.", doi="10.1234/example")
            report.build()
            fonts, findings = inspect_fonts(output)

        self.assertEqual(findings, [])
        self.assertTrue(any("Oblique" in font["name"] for font in fonts))

    @unittest.skipIf(shutil.which("pdfinfo") is None, "pdfinfo is unavailable")
    def test_reference_method_embeds_a_clickable_doi(self) -> None:
        reportlab, _ = reportlab_modules()
        template = load_report_template()
        reportlab_dir = Path(reportlab.__file__).parent
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "reference-link.pdf"
            report = template.ScientificReport(
                output,
                "DOI link check",
                reportlab_dir / "fonts" / "Vera.ttf",
                reportlab_dir / "fonts" / "VeraBd.ttf",
            )
            report.add_front_matter()
            report.reference("Author (2024). A paper.", doi="10.1234/example")
            report.build()

            self.assertEqual(
                inspect_doi_links(output, "https://doi.org/10.1234/example"), []
            )


if __name__ == "__main__":
    unittest.main()
