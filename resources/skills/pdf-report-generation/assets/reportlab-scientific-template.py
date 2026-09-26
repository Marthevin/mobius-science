"""Reusable ReportLab components for a flowing, embedded-font research PDF.

Copy and adapt this module in the report workspace. Supply TrueType/OpenType
font files explicitly so the resulting PDF does not depend on viewer fonts.
"""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
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
    *,
    reference: str | Path | None = None,
    regular_subfont_index: int = 0,
    bold_subfont_index: int = 0,
    reference_subfont_index: int = 0,
) -> dict[str, str]:
    """Register fonts used by the template; all paths must resolve to font files."""

    paths = {
        "ResearchRegular": Path(regular),
        "ResearchBold": Path(bold or regular),
        "ResearchItalic": Path(italic or regular),
        "ResearchBoldItalic": Path(bold_italic or bold or italic or regular),
    }
    if reference:
        paths["ResearchReference"] = Path(reference)
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError(
            f"Font file(s) not found: {', '.join(sorted(set(missing)))}"
        )
    for name, path in paths.items():
        if name == "ResearchReference":
            index = reference_subfont_index
        elif name in {"ResearchBold", "ResearchBoldItalic"}:
            index = bold_subfont_index
        else:
            index = regular_subfont_index
        pdfmetrics.registerFont(TTFont(name, str(path), subfontIndex=index))
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
        language: str = "en",
        author: str = "Mobius Science",
        reference_font: str | Path | None = None,
        regular_subfont_index: int = 0,
        bold_subfont_index: int = 0,
        reference_subfont_index: int = 0,
        page_size=A4,
    ) -> None:
        if language not in {"en", "zh", "mixed"}:
            raise ValueError("language must be en, zh, or mixed")
        self.output = Path(output)
        self.title = title
        self.subtitle = subtitle
        self.metadata_line = metadata_line
        self.language = language
        register_embedded_fonts(
            regular_font,
            bold_font,
            reference=reference_font,
            regular_subfont_index=regular_subfont_index,
            bold_subfont_index=bold_subfont_index,
            reference_subfont_index=reference_subfont_index,
        )
        self.styles = self._styles(
            language, separate_reference_face=reference_font is not None
        )
        self.story: list[object] = []
        self.doc = SimpleDocTemplate(
            str(self.output),
            pagesize=page_size,
            leftMargin=22 * mm,
            rightMargin=22 * mm,
            topMargin=23 * mm,
            bottomMargin=20 * mm,
            title=title,
            author=author,
        )

    @staticmethod
    def _styles(
        language: str = "en", *, separate_reference_face: bool = False
    ) -> dict[str, ParagraphStyle]:
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
            "reference": ParagraphStyle(
                "ResearchReference",
                parent=base["BodyText"],
                fontName="ResearchReference"
                if separate_reference_face
                else "ResearchRegular",
                fontSize=9.2,
                leading=13.2,
                textColor=INK,
                alignment=TA_LEFT,
                leftIndent=12,
                firstLineIndent=-12,
                spaceAfter=4,
            ),
        }
        if language == "zh":
            # ReportLab's full justification expands gaps around mixed Hanzi and
            # Latin citations. A ragged right edge is more legible in Chinese.
            for style in styles.values():
                style.wordWrap = "CJK"
            styles["title"].fontSize = 20
            styles["title"].leading = 27
            styles["body"].fontSize = 10.5
            styles["body"].leading = 17
            styles["body"].alignment = TA_LEFT
            styles["meta"].fontSize = 9
            styles["meta"].leading = 13
            styles["caption"].fontSize = 9
            styles["caption"].leading = 13
            styles["table"].fontSize = 9
            styles["table"].leading = 12.5
            styles["table_head"].fontSize = 9
            styles["table_head"].leading = 12.5
            styles["reference"].fontSize = 9.6
            styles["reference"].leading = 14.2
            styles["reference"].spaceAfter = 5.5
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
        canvas.line(
            doc.leftMargin, height - 14 * mm, width - doc.rightMargin, height - 14 * mm
        )
        canvas.setFont("ResearchRegular", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(doc.leftMargin, 10 * mm, self.title[:72])
        canvas.drawRightString(width - doc.rightMargin, 10 * mm, str(doc.page))
        canvas.restoreState()

    @staticmethod
    def _paragraph(
        text: str, style: ParagraphStyle, *, markup: bool = False
    ) -> Paragraph:
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
        self.story.append(
            self._paragraph(text, self.styles["h1" if level == 1 else "h2"])
        )

    def paragraph(self, text: str, *, markup: bool = False) -> None:
        self.story.append(self._paragraph(text, self.styles["body"], markup=markup))

    def callout(self, text: str, *, markup: bool = False) -> None:
        self.story.append(self._paragraph(text, self.styles["callout"], markup=markup))

    def reference(self, citation: str, *, doi: str | None = None) -> None:
        """Add a verified citation (without its DOI) and a clickable DOI when supplied."""

        content = escape(citation)
        if doi:
            identifier = re.sub(
                r"^https?://(?:dx\.)?doi\.org/", "", doi.strip(), flags=re.I
            )
            if not re.fullmatch(r"10\.\d{4,9}/\S+", identifier, flags=re.I):
                raise ValueError(f"Invalid DOI: {doi}")
            url = "https://doi.org/" + quote(identifier, safe="/-._;()")
            href = escape(url, {'"': "&quot;"})
            content += f' <link href="{href}">{escape(url)}</link>'
        self.story.append(Paragraph(content, self.styles["reference"]))

    def table(
        self,
        rows: list[list[object]],
        *,
        column_widths: list[float] | None = None,
        repeat_header: bool = True,
        caption: str | None = None,
        keep_together: bool = False,
    ) -> None:
        if not rows or not rows[0]:
            raise ValueError("Table requires at least one non-empty row")
        columns = len(rows[0])
        if any(len(row) != columns for row in rows):
            raise ValueError("Every table row must have the same number of cells")
        available = self.doc.width
        widths = column_widths or [available / columns] * columns
        if abs(sum(widths) - available) > 1:
            raise ValueError(
                f"Column widths must sum to the content width ({available:.1f} points)"
            )
        wrapped = []
        for row_index, row in enumerate(rows):
            style = self.styles[
                "table_head" if row_index == 0 and repeat_header else "table"
            ]
            wrapped.append([self._paragraph(str(cell), style) for cell in row])
        table = LongTable(
            wrapped, colWidths=widths, repeatRows=1 if repeat_header else 0
        )
        table.hAlign = "LEFT"
        table_commands = [
            # Table's own cell style defaults to Helvetica even when every
            # visible cell is a Paragraph. Set it explicitly so ReportLab
            # does not emit an unused, unembedded base-14 font resource.
            ("FONTNAME", (0, 0), (-1, -1), "ResearchRegular"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            (
                "ROWBACKGROUNDS",
                (0, 1 if repeat_header else 0),
                (-1, -1),
                [colors.white, colors.HexColor("#F5F7F8")],
            ),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
        ]
        if repeat_header:
            table_commands.insert(0, ("BACKGROUND", (0, 0), (-1, 0), ACCENT))
        table.setStyle(TableStyle(table_commands))
        flowables: list[object] = [table]
        if caption:
            flowables.append(self._paragraph(caption, self.styles["caption"]))
        flowables.append(Spacer(1, 3 * mm))
        if keep_together:
            self.story.append(KeepTogether(flowables))
        else:
            self.story.extend(flowables)

    def figure(
        self, path: str | Path, caption: str, *, width: float | None = None
    ) -> None:
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
        self.doc.build(
            self.story, onFirstPage=self._on_page, onLaterPages=self._on_page
        )
        return self.output
