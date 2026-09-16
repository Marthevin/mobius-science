import importlib.util
import shutil
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from pdf_quality_gate import file_identity, inspect_fonts, inspect_page_count, inspect_page_images


def load_report_template():
    template_path = (
        Path(__file__).parents[1] / "assets" / "reportlab-scientific-template.py"
    )
    spec = importlib.util.spec_from_file_location("scientific_report_template", template_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_page_count_range_flags_report_outside_requested_bounds() -> None:
    too_long = inspect_page_count(12, minimum=9, maximum=10)
    too_short = inspect_page_count(7, minimum=9, maximum=10)

    assert [(item.severity, item.code) for item in too_long] == [
        ("warning", "too-many-pages")
    ]
    assert [(item.severity, item.code) for item in too_short] == [
        ("warning", "too-few-pages")
    ]


def test_custom_bottom_blank_threshold_flags_visually_unbalanced_page(
    tmp_path: Path,
) -> None:
    page = tmp_path / "page-01.png"
    image = Image.new("RGB", (500, 1000), "white")
    ImageDraw.Draw(image).rectangle((35, 60, 465, 650), fill="black")
    image.save(page)

    _, findings = inspect_page_images([page], maximum_bottom_blank=0.25)

    assert [(item.severity, item.code, item.page) for item in findings] == [
        ("warning", "large-bottom-gap", 1)
    ]


def test_file_identity_binds_qa_to_exact_bytes(tmp_path: Path) -> None:
    candidate = tmp_path / "report.pdf"
    candidate.write_bytes(b"candidate revision")

    assert file_identity(candidate) == {
        "bytes": 18,
        "sha256": "717b75d69a969a9b8174cd77989a30868b0168cd954c560a25b23d2f61f14df9",
    }


@pytest.mark.skipif(shutil.which("pdffonts") is None, reason="pdffonts is unavailable")
def test_report_template_embeds_fonts_for_bullets_and_tables(tmp_path: Path) -> None:
    reportlab = pytest.importorskip("reportlab")
    Paragraph = pytest.importorskip("reportlab.platypus").Paragraph
    template = load_report_template()
    reportlab_dir = Path(reportlab.__file__).parent
    output = tmp_path / "font-check.pdf"
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

    assert findings == []
    assert fonts
    assert all("Helvetica" not in font["name"] for font in fonts)
