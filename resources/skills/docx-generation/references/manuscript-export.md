# Prose manuscript export

For essays, proposals and prose manuscripts using ordinary headings, paragraphs,
lists, quotes and simple tables, use `scripts/build_manuscript.py` from the format's
Skill instead of rebuilding a parser and typesetting program in the session.
Transfer it and the matching `assets/*-scientific-template.py` through
`host.skills.read`, preserving their package paths. Install `mistune>=3,<4` plus
`python-docx` for Word or `reportlab` for PDF through the managed package tool.
Inspect packages before installing; do not reinstall a working environment.

The helper accepts one frozen `manuscript.md`:

- Exactly one initial `# Title`; `##` sections, `###` and `####` subsections.
- Body paragraphs separated by blank lines. `*Italics*`, `**bold**`, HTTP(S)
  hyperlinks, bare URLs and DOI identifiers become real formatting/links in both
  outputs. Linking a DOI does not verify that it resolves or supports a claim.
- A real `## References` / `## 参考文献` heading. One complete citation per source
  line, with a blank line between entries. Bibliography soft-wraps are rejected
  rather than merging multiple entries. Style the bibliography according to the
  selected citation convention; heading Title Case does not change source titles.
- Plain lists and block quotes. Precede each pipe table with a numbered caption
  paragraph, e.g. `Table 1. Questions and discriminating evidence.` Tables remain
  editable in Word. Inspect column widths for the actual content.

```text
python scripts/build_manuscript.py manuscript.md article.docx --language en --require-references
python scripts/build_manuscript.py manuscript.md article.pdf --language en --require-references --regular-font REGULAR.ttf --bold-font BOLD.ttf --italic-font ITALIC.ttf --bold-italic-font BOLD_ITALIC.ttf
```

Run each command from the corresponding transferred package. Supply verified
local font paths, never placeholder paths. For Chinese use `--language zh` and
fonts covering the actual Hanzi. Word accepts `--cjk-font 'FONT FAMILY'` and
`--latin-font 'FONT FAMILY'` to select a verified available family. For PDF TTC
collections inspect the face names, then supply `--regular-subfont-index` and
`--bold-subfont-index`; index zero is not necessarily regular. Do not silently
use a black/heavy face for body text. Use separate Python processes for different font
families. The default academic profile is quiet, black typography, flowing pages,
real headings, hanging references and page numbers; a supplied venue template
takes precedence. Review long-title wrapping visually rather than shrinking all
body text. The helper preserves heading wording and case; authors choose the
required case before export.

Equations, footnotes, code, nested lists, figures, complex tables and custom
templates need the document Skill's composition API or another supported renderer.
The helper rejects unsupported syntax instead of dropping it. Preserve that
content when adapting; do not remove it just to make a build pass. It does not
retrieve or verify citations, enforce a reference quota, or ban Chinese/media.

The receipt binds source and output hashes; `visual_qa: not_performed` is deliberate.
Run the original format-specific validator on the delivered bytes, render every
page, inspect all pages, and keep semantic/visual/product acceptance separate.
Word and ReportLab may paginate differently even from identical content; check both.
