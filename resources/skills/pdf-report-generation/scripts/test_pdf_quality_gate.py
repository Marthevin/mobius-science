#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

from pdf_quality_gate import file_identity, inspect_fonts, inspect_page_count, inspect_page_images


def load_report_template():
    template_path = SCRIPT_DIR.parent / "assets" / "reportlab-scientific-template.py"
    spec = importlib.util.spec_from_file_location("scientific_report_template", template_path)
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
            self.assertFalse(any(command[0] == "BACKGROUND" for command in table._bkgrndcmds))
            self.assertTrue(
                any(
                    command[0] == "ROWBACKGROUNDS" and command[1] == (0, 0)
                    for command in table._bkgrndcmds
                )
            )


if __name__ == "__main__":
    unittest.main()
