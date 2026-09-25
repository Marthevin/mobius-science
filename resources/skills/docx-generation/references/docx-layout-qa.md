# Word layout and release QA

Use the requested journal or institutional template when provided. Otherwise use restrained research-document typography: a descriptive title, explicit heading hierarchy, 10–11 pt body text with comfortable line spacing, readable references and captions, and margins that leave tables inside the text frame. The document must remain editable: paragraphs as Word text, tables as Word tables, and figures as separately replaceable images with real captions.

## Word structure

Use built-in `Title` and `Heading 1`–`Heading 3` styles rather than manually bolding ordinary paragraphs. Set both Latin and East Asian font mappings for mixed-script reports; DOCX does not guarantee that a recipient has the same fonts. Use language metadata and verify the final rendering on a system representative of the reader's editor. Keep headings with following text, prevent table rows from splitting, repeat the header row on long tables, and give tables and images independent numbered captions. Do not invent cross-references or a table of contents: use Word fields when those are required by the brief.

The starter template adds a Word PAGE field in the footer. Confirm its displayed number increments after rendering and replace it if the target journal supplies its own pagination or title-page rules.

For Chinese prose, inspect line wraps around English citations, numbers, and punctuation. Do not fully justify mixed Hanzi/Latin text if it creates stretched spaces. For English reports, inspect author diacritics and scientific symbols after export. Keep references as hanging-indent paragraphs with clickable DOI hyperlinks. Do not duplicate the DOI in the citation string and the appended hyperlink.

## Verify the actual deliverable

Run the bundled `scripts/docx_quality_gate.py candidate.docx --output-dir qa --language zh --min-cjk-chars 4000 --require-doi-links --soffice /path/to/soffice --strict`, adjusting the language and floor to the report's legitimate scope. The gate tests the ZIP/OOXML package, text length, Word Title, captions, DOI relationships, and generates a PDF page proof with PNGs when a LibreOffice binary is supplied. If a renderer is unavailable, run structural checks and record visual QA as pending; do not call the DOCX finished.

For a document using the template's Noto Serif SC mapping, the renderer automatically loads the bundled font from `assets/fonts/` and flags a PDF proof that did not embed it. This avoids a common false pass: searchable Chinese text whose visible glyphs are squares. The embedded-font check cannot detect every layout defect; inspect the page images as well. If the target editor lacks Noto Serif SC, either install the bundled font there or substitute a verified local CJK font and render again in that editor.

Review every PNG page, not merely the first or a contact sheet. Record page-specific findings and corrections. Check the exact delivered DOCX hash after the last edit; a prior page proof does not validate later bytes. A PDF proof is a QA artifact, not a substitute for the editable `.docx`. Word and LibreOffice can paginate differently, so run a final Word check when the recipient's Word layout is binding.
