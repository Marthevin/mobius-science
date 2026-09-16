"""Reusable ReportLab components for a flowing, embedded-font research PDF.

Copy and adapt this module in the report workspace. Supply TrueType/OpenType
font files explicitly so the resulting PDF does not depend on viewer fonts.
"""

from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    LongTable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


INK = colors.HexColor("#16232E")
MUTED = colors.HexColor("#52636F")
ACCENT = colors.HexColor("#087F8C")
PALE = colors.HexColor("#EAF4F4")
RULE = colors.HexColor("#CBD5DA")


def register_embedded_fonts(
    regular: str | Path,
    bold: str | Path | None = None,
    italic: str | Path | None = None,
    bold_italic: str | Path | None = None,
) -> dict[str, str]:
    """Register fonts used by the template; all paths must resolve to font files."""

    paths = {
        "ResearchRegular": Path(regular),
        "ResearchBold": Path(bold or regular),
        "ResearchItalic": Path(italic or regular),
        "ResearchBoldItalic": Path(bold_italic or bold or italic or regular),
    }
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Font file(s) not found: {', '.join(sorted(set(missing)))}")
    for name, path in paths.items():
        pdfmetrics.registerFont(TTFont(name, str(path)))
    pdfmetrics.registerFontFamily(
        "Research",
        normal="ResearchRegular",
        bold="ResearchBold",
        italic="ResearchItalic",
        boldItalic="ResearchBoldItalic",
    )
    # ReportLab otherwise inserts an unused Helvetica resource at the start of
    # every page, which makes strict font-embedding checks fail.
    rl_config.canvas_basefontname = "ResearchRegular"
    return {key: key for key in paths}


class ScientificReport:
    """Small composition API that keeps scientific content in a flowing layout."""

    def __init__(
        self,
        output: str | Path,
        title: str,
        regular_font: str | Path,
        bold_font: str | Path | None = None,
        *,
        subtitle: str = "",
        metadata_line: str = "",
        page_size=A4,
    ) -> None:
        self.output = Path(output)
        self.title = title
        self.subtitle = subtitle
        self.metadata_line = metadata_line
        register_embedded_fonts(regular_font, bold_font)
        self.styles = self._styles()
        self.story: list[object] = []
        self.doc = SimpleDocTemplate(
            str(self.output),
            pagesize=page_size,
            leftMargin=22 * mm,
            rightMargin=22 * mm,
            topMargin=23 * mm,
            bottomMargin=20 * mm,
            title=title,
            author="Open Science",
        )

    @staticmethod
    def _styles() -> dict[str, ParagraphStyle]:
        base = getSampleStyleSheet()
        styles = {
            "title": ParagraphStyle(
                "ResearchTitle",
                parent=base["Title"],
                fontName="ResearchBold",
                fontSize=22,
                leading=27,
                textColor=INK,
                alignment=TA_LEFT,
                spaceAfter=8,
            ),
            "subtitle": ParagraphStyle(
                "ResearchSubtitle",
                parent=base["Normal"],
                fontName="ResearchRegular",
                fontSize=11,
                leading=15,
                textColor=MUTED,
                spaceAfter=7,
            ),
            "meta": ParagraphStyle(
                "ResearchMetadata",
                parent=base["Normal"],
                fontName="ResearchRegular",
                fontSize=8.5,
                leading=11,
                textColor=MUTED,
                spaceAfter=10,
            ),
            "h1": ParagraphStyle(
                "ResearchH1",
                parent=base["Heading1"],
                fontName="ResearchBold",
                fontSize=15,
                leading=19,
                textColor=INK,
                spaceBefore=15,
                spaceAfter=7,
                keepWithNext=True,
            ),
            "h2": ParagraphStyle(
                "ResearchH2",
                parent=base["Heading2"],
                fontName="ResearchBold",
                fontSize=11.5,
                leading=15,
                textColor=ACCENT,
                spaceBefore=11,
                spaceAfter=5,
                keepWithNext=True,
            ),
            "body": ParagraphStyle(
                "ResearchBody",
                parent=base["BodyText"],
                fontName="ResearchRegular",
                fontSize=9.6,
                leading=14.2,
                textColor=INK,
                alignment=TA_JUSTIFY,
                spaceAfter=7,
                splitLongWords=False,
            ),
            "caption": ParagraphStyle(
                "ResearchCaption",
                parent=base["BodyText"],
                fontName="ResearchRegular",
                fontSize=8.2,
                leading=11,
                textColor=MUTED,
                spaceBefore=4,
                spaceAfter=9,
            ),
            "table": ParagraphStyle(
                "ResearchTable",
                parent=base["BodyText"],
                fontName="ResearchRegular",
                fontSize=7.8,
                leading=10.2,
                textColor=INK,
            ),
            "table_head": ParagraphStyle(
                "ResearchTableHead",
                parent=base["BodyText"],
                fontName="ResearchBold",
                fontSize=7.8,
                leading=10.2,
                textColor=colors.white,
                alignment=TA_LEFT,
            ),
            "callout": ParagraphStyle(
                "ResearchCallout",
                parent=base["BodyText"],
                fontName="ResearchRegular",
                fontSize=9.4,
                leading=13.5,
                textColor=INK,
                borderColor=ACCENT,
                borderWidth=0.8,
                borderPadding=8,
                backColor=PALE,
                spaceBefore=6,
                spaceAfter=9,
            ),
        }
        # ParagraphStyle inherits Helvetica as its bullet font even when the
        # visible text uses an embedded face. A bulletText paragraph would
        # otherwise leak an unembedded base-14 font into the PDF resources.
        for style in styles.values():
            style.bulletFontName = "ResearchRegular"
        return styles

    def _on_page(self, canvas, doc) -> None:
        canvas.saveState()
        width, height = doc.pagesize
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(doc.leftMargin, height - 14 * mm, width - doc.rightMargin, height - 14 * mm)
        canvas.setFont("ResearchRegular", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(doc.leftMargin, 10 * mm, self.title[:72])
        canvas.drawRightString(width - doc.rightMargin, 10 * mm, str(doc.page))
        canvas.restoreState()

    @staticmethod
    def _paragraph(text: str, style: ParagraphStyle, *, markup: bool = False) -> Paragraph:
        content = text if markup else escape(text).replace("\n", "<br/>")
        return Paragraph(content, style)

    def add_front_matter(self) -> None:
        self.story.append(self._paragraph(self.title, self.styles["title"]))
        if self.subtitle:
            self.story.append(self._paragraph(self.subtitle, self.styles["subtitle"]))
        if self.metadata_line:
            self.story.append(self._paragraph(self.metadata_line, self.styles["meta"]))
        self.story.extend([HRFlowable(color=ACCENT, thickness=1.2), Spacer(1, 6 * mm)])

    def heading(self, text: str, level: int = 1) -> None:
        self.story.append(self._paragraph(text, self.styles["h1" if level == 1 else "h2"]))

    def paragraph(self, text: str, *, markup: bool = False) -> None:
        self.story.append(self._paragraph(text, self.styles["body"], markup=markup))

    def callout(self, text: str, *, markup: bool = False) -> None:
        self.story.append(self._paragraph(text, self.styles["callout"], markup=markup))

    def table(
        self,
        rows: list[list[object]],
        *,
        column_widths: list[float] | None = None,
        repeat_header: bool = True,
    ) -> None:
        if not rows or not rows[0]:
            raise ValueError("Table requires at least one non-empty row")
        columns = len(rows[0])
        if any(len(row) != columns for row in rows):
            raise ValueError("Every table row must have the same number of cells")
        available = self.doc.width
        widths = column_widths or [available / columns] * columns
        if abs(sum(widths) - available) > 1:
            raise ValueError(f"Column widths must sum to the content width ({available:.1f} points)")
        wrapped = []
        for row_index, row in enumerate(rows):
            style = self.styles["table_head" if row_index == 0 and repeat_header else "table"]
            wrapped.append([self._paragraph(str(cell), style) for cell in row])
        table = LongTable(wrapped, colWidths=widths, repeatRows=1 if repeat_header else 0)
        table.hAlign = "LEFT"
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                    # Table's own cell style defaults to Helvetica even when every
                    # visible cell is a Paragraph. Set it explicitly so ReportLab
                    # does not emit an unused, unembedded base-14 font resource.
                    ("FONTNAME", (0, 0), (-1, -1), "ResearchRegular"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F7F8")]),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
                ]
            )
        )
        self.story.extend([table, Spacer(1, 3 * mm)])

    def figure(self, path: str | Path, caption: str, *, width: float | None = None) -> None:
        image = Image(str(path))
        target_width = min(width or self.doc.width, self.doc.width)
        ratio = image.imageHeight / image.imageWidth
        image.drawWidth = target_width
        image.drawHeight = target_width * ratio
        max_height = self.doc.height * 0.62
        if image.drawHeight > max_height:
            scale = max_height / image.drawHeight
            image.drawHeight *= scale
            image.drawWidth *= scale
        caption_flowable = self._paragraph(caption, self.styles["caption"])
        self.story.append(KeepTogether([image, caption_flowable]))

    def intentional_page_break(self) -> None:
        self.story.append(PageBreak())

    def build(self) -> Path:
        self.output.parent.mkdir(parents=True, exist_ok=True)
        self.doc.build(self.story, onFirstPage=self._on_page, onLaterPages=self._on_page)
        return self.output
