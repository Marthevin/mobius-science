#!/usr/bin/env python3
"""Render and inspect a research PDF for common release-blocking defects.

This gate catches deterministic defects and creates artifacts for manual review.
It cannot detect every overlap, clipped label, weak argument, or misleading chart.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


@dataclass
class Finding:
    severity: str
    code: str
    message: str
    page: int | None = None


def run(command: list[str]) -> str:
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    return completed.stdout


def file_identity(path: Path) -> dict[str, int | str]:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"bytes": path.stat().st_size, "sha256": digest.hexdigest()}


def require_commands(names: Iterable[str]) -> list[Finding]:
    return [
        Finding("error", "missing-command", f"Required command is unavailable: {name}")
        for name in names
        if shutil.which(name) is None
    ]


def parse_page_count(pdf: Path) -> int:
    output = run(["pdfinfo", str(pdf)])
    match = re.search(r"^Pages:\s+(\d+)\s*$", output, flags=re.MULTILINE)
    if not match:
        raise RuntimeError("pdfinfo did not report a page count")
    return int(match.group(1))


def inspect_page_count(
    page_count: int, minimum: int = 0, maximum: int = 0
) -> list[Finding]:
    findings: list[Finding] = []
    if minimum and page_count < minimum:
        findings.append(
            Finding(
                "warning",
                "too-few-pages",
                f"PDF has {page_count} pages; the requested minimum is {minimum}",
            )
        )
    if maximum and page_count > maximum:
        findings.append(
            Finding(
                "warning",
                "too-many-pages",
                f"PDF has {page_count} pages; the requested maximum is {maximum}",
            )
        )
    return findings


def inspect_fonts(pdf: Path) -> tuple[list[dict[str, str]], list[Finding]]:
    output = run(["pdffonts", str(pdf)])
    fonts: list[dict[str, str]] = []
    findings: list[Finding] = []
    for line in output.splitlines():
        match = re.search(
            r"^(?P<prefix>.+?)\s+(?P<embedded>yes|no)\s+(?P<subset>yes|no)\s+"
            r"(?P<unicode>yes|no)\s+\d+\s+\d+\s*$",
            line,
        )
        if not match or line.lstrip().startswith("name"):
            continue
        prefix = match.group("prefix").split()
        name = prefix[0] if prefix else "unknown"
        record = {
            "name": name,
            "embedded": match.group("embedded"),
            "subset": match.group("subset"),
            "unicode": match.group("unicode"),
        }
        fonts.append(record)
        if record["embedded"] != "yes":
            findings.append(
                Finding("error", "font-not-embedded", f"Font is not embedded: {name}")
            )
    if not fonts:
        findings.append(Finding("error", "font-parse", "No font records were parsed"))
    return fonts, findings


def inspect_text(
    pdf: Path, language: str, minimum_words: int, minimum_cjk_chars: int = 0
) -> tuple[str, dict[str, int], list[Finding]]:
    text = run(["pdftotext", "-layout", str(pdf), "-"])
    findings: list[Finding] = []
    page_text = text.split("\f")
    word_count = len(re.findall(r"\b[A-Za-z][A-Za-z'’-]*\b", text))
    cjk_count = len(re.findall(r"[\u3400-\u9fff]", text))

    leaked = {
        "html-entity": r"&(gt|lt|amp|quot|apos|nbsp);",
        "template-placeholder": r"\b(TODO|TBD|LOREM IPSUM|INSERT (FIGURE|TABLE|TEXT))\b",
    }
    for code, pattern in leaked.items():
        for page_index, current in enumerate(page_text, start=1):
            match = re.search(pattern, current, flags=re.IGNORECASE)
            if match:
                findings.append(
                    Finding(
                        "error",
                        code,
                        f"Visible source token in extracted text: {match.group(0)!r}",
                        page_index,
                    )
                )

    if language == "en" and cjk_count:
        findings.append(
            Finding(
                "warning",
                "unexpected-cjk",
                f"English report contains {cjk_count} CJK characters; check for untranslated prose",
            )
        )
    if language == "zh" and cjk_count == 0:
        findings.append(
            Finding(
                "error",
                "missing-cjk-text",
                "Chinese PDF has no extractable Hanzi; check font coverage and rendered pages",
            )
        )
    cjk_floor = max(minimum_cjk_chars, minimum_words if language == "zh" else 0)
    if cjk_floor and cjk_count < cjk_floor:
        findings.append(
            Finding(
                "warning",
                "short-report-cjk",
                f"Extracted CJK character count {cjk_count} is below the requested floor {cjk_floor}",
            )
        )
    if language != "zh" and minimum_words and word_count < minimum_words:
        findings.append(
            Finding(
                "warning",
                "short-report",
                f"Extracted English word count {word_count} is below the requested floor {minimum_words}",
            )
        )
    return text, {"english_words": word_count, "cjk_characters": cjk_count}, findings


def _doi_set(value: str) -> set[str]:
    dois = set()
    for match in re.finditer(
        r"\b10\.\d{4,9}/[^\s<>]+", unquote(value), flags=re.IGNORECASE
    ):
        doi = match.group(0).rstrip(".,;:，。；：")
        while doi.endswith(")") and doi.count(")") > doi.count("("):
            doi = doi[:-1]
        dois.add(doi.casefold())
    return dois


def inspect_doi_links(pdf: Path, extracted_text: str) -> list[Finding]:
    """Check that visible DOI identifiers have matching PDF URI annotations."""

    visible = _doi_set(extracted_text)
    if not visible:
        return []
    annotations = run(["pdfinfo", "-url", str(pdf)])
    linked = set()
    for line in annotations.splitlines():
        if re.search(r"https?://(?:dx\.)?doi\.org/", line, flags=re.IGNORECASE):
            linked.update(_doi_set(line))
    missing = sorted(visible - linked)
    if not missing:
        return []
    preview = ", ".join(missing[:3])
    suffix = f" (and {len(missing) - 3} more)" if len(missing) > 3 else ""
    return [
        Finding(
            "warning",
            "unlinked-doi",
            f"{len(missing)} visible DOI(s) have no matching clickable link: {preview}{suffix}",
        )
    ]


def render_pages(pdf: Path, pages_dir: Path, dpi: int) -> list[Path]:
    pages_dir.mkdir(parents=True, exist_ok=True)
    for stale_page in pages_dir.glob("page-*.png"):
        stale_page.unlink()
    prefix = pages_dir / "page"
    subprocess.run(
        ["pdftoppm", "-png", "-r", str(dpi), str(pdf), str(prefix)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    return sorted(
        pages_dir.glob("page-*.png"), key=lambda p: int(p.stem.split("-")[-1])
    )


def page_metrics(image_path: Path) -> dict[str, float]:
    from PIL import Image

    with Image.open(image_path) as source:
        image = source.convert("L")
    target_width = 500
    target_height = max(1, round(image.height * target_width / image.width))
    image = image.resize((target_width, target_height))
    pixels = image.load()
    left, right = int(target_width * 0.05), int(target_width * 0.95)
    top, bottom = int(target_height * 0.06), int(target_height * 0.91)
    width = right - left
    row_ink: list[int] = []
    total_ink = 0
    for y in range(top, bottom):
        dark = sum(1 for x in range(left, right) if pixels[x, y] < 242)
        row_ink.append(dark)
        total_ink += dark
    active = [value >= max(2, int(width * 0.0025)) for value in row_ink]
    active_indices = [index for index, value in enumerate(active) if value]
    if not active_indices:
        return {
            "ink_ratio": 0.0,
            "bottom_blank_ratio": 1.0,
            "largest_internal_gap": 1.0,
        }
    first, last = active_indices[0], active_indices[-1]
    longest = current = 0
    for value in active[first : last + 1]:
        if value:
            longest = max(longest, current)
            current = 0
        else:
            current += 1
    longest = max(longest, current)
    usable_rows = len(row_ink)
    return {
        "ink_ratio": total_ink / (width * usable_rows),
        "bottom_blank_ratio": (usable_rows - 1 - last) / usable_rows,
        "largest_internal_gap": longest / usable_rows,
    }


def inspect_page_images(
    paths: list[Path], maximum_bottom_blank: float = 0.34
) -> tuple[list[dict[str, float]], list[Finding]]:
    metrics: list[dict[str, float]] = []
    findings: list[Finding] = []
    for page, path in enumerate(paths, start=1):
        current = page_metrics(path)
        metrics.append(current)
        if current["ink_ratio"] < 0.012:
            findings.append(
                Finding(
                    "warning",
                    "sparse-page",
                    f"Page ink ratio is only {current['ink_ratio']:.3f}; inspect for unjustified blank space",
                    page,
                )
            )
        if current["bottom_blank_ratio"] > maximum_bottom_blank:
            findings.append(
                Finding(
                    "warning",
                    "large-bottom-gap",
                    f"Bottom {current['bottom_blank_ratio']:.0%} of the content frame appears blank",
                    page,
                )
            )
        if current["largest_internal_gap"] > 0.28:
            findings.append(
                Finding(
                    "warning",
                    "large-internal-gap",
                    f"An internal blank band spans {current['largest_internal_gap']:.0%} of the content frame",
                    page,
                )
            )
    return metrics, findings


def make_contact_sheet(paths: list[Path], output: Path) -> None:
    from PIL import Image, ImageDraw

    thumbs = []
    for page, path in enumerate(paths, start=1):
        with Image.open(path) as source:
            thumb = source.convert("RGB")
        thumb.thumbnail((320, 440))
        canvas = Image.new("RGB", (340, 480), "white")
        canvas.paste(thumb, ((340 - thumb.width) // 2, 24))
        ImageDraw.Draw(canvas).text((12, 452), f"Page {page}", fill="black")
        thumbs.append(canvas)
    columns = min(3, max(1, len(thumbs)))
    rows = (len(thumbs) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * 340, rows * 480), (225, 225, 225))
    for index, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((index % columns) * 340, (index // columns) * 480))
    sheet.save(output)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--language", choices=("en", "zh", "mixed"), default="mixed")
    parser.add_argument(
        "--min-words",
        type=int,
        default=0,
        help="English word floor; with --language zh, this legacy option is a CJK character floor",
    )
    parser.add_argument("--min-cjk-chars", type=int, default=0)
    parser.add_argument("--min-pages", type=int, default=0)
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--max-bottom-blank", type=float, default=0.34)
    parser.add_argument("--dpi", type=int, default=120)
    parser.add_argument("--require-doi-links", action="store_true")
    parser.add_argument(
        "--strict", action="store_true", help="Treat warnings as failures"
    )
    args = parser.parse_args()
    if args.min_pages < 0 or args.max_pages < 0:
        parser.error("page limits must be zero or positive")
    if args.min_words < 0 or args.min_cjk_chars < 0:
        parser.error("text length floors must be zero or positive")
    if args.min_pages and args.max_pages and args.min_pages > args.max_pages:
        parser.error("--min-pages cannot exceed --max-pages")
    if not 0 <= args.max_bottom_blank <= 1:
        parser.error("--max-bottom-blank must be between 0 and 1")

    pdf = args.pdf.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    findings = require_commands(("pdfinfo", "pdffonts", "pdftotext", "pdftoppm"))
    if not pdf.is_file():
        findings.append(Finding("error", "missing-pdf", f"PDF not found: {pdf}"))

    report: dict[str, object] = {"pdf": str(pdf), "findings": []}
    if pdf.is_file():
        report["file_identity"] = file_identity(pdf)
    if not any(item.severity == "error" for item in findings):
        try:
            page_count = parse_page_count(pdf)
            findings.extend(
                inspect_page_count(page_count, args.min_pages, args.max_pages)
            )
            fonts, font_findings = inspect_fonts(pdf)
            text, text_metrics, text_findings = inspect_text(
                pdf, args.language, args.min_words, args.min_cjk_chars
            )
            (output_dir / "extracted.txt").write_text(text, encoding="utf-8")
            page_paths = render_pages(pdf, output_dir / "pages", args.dpi)
            if len(page_paths) != page_count:
                findings.append(
                    Finding(
                        "error",
                        "render-page-count",
                        f"Rendered {len(page_paths)} images for a {page_count}-page PDF",
                    )
                )
            page_results, page_findings = inspect_page_images(
                page_paths, args.max_bottom_blank
            )
            make_contact_sheet(page_paths, output_dir / "contact-sheet.png")
            findings.extend(font_findings + text_findings + page_findings)
            if args.require_doi_links:
                findings.extend(inspect_doi_links(pdf, text))
            report.update(
                {
                    "page_count": page_count,
                    "requested_page_range": {
                        "minimum": args.min_pages,
                        "maximum": args.max_pages,
                    },
                    "maximum_bottom_blank": args.max_bottom_blank,
                    "fonts": fonts,
                    "text_metrics": text_metrics,
                    "page_metrics": page_results,
                    "rendered_pages": [str(path) for path in page_paths],
                    "contact_sheet": str(output_dir / "contact-sheet.png"),
                }
            )
        except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
            findings.append(Finding("error", "inspection-failed", str(exc)))
        except ImportError as exc:
            findings.append(Finding("error", "missing-pillow", str(exc)))

    report["findings"] = [asdict(item) for item in findings]
    report_path = output_dir / "quality-report.json"
    report_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    for item in findings:
        location = f" page={item.page}" if item.page else ""
        print(f"{item.severity.upper():7} {item.code}{location}: {item.message}")
    errors = sum(item.severity == "error" for item in findings)
    warnings = sum(item.severity == "warning" for item in findings)
    print(f"QA report: {report_path}")
    if "file_identity" in report:
        identity = report["file_identity"]
        assert isinstance(identity, dict)
        print(f"PDF SHA-256: {identity['sha256']}")
    print(f"Summary: {errors} error(s), {warnings} warning(s)")
    return 1 if errors or (args.strict and warnings) else 0


if __name__ == "__main__":
    sys.exit(main())
