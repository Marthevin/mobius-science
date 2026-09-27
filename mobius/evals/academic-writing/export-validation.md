# Exporter validation, 2026-09-27

This is a deterministic rendering regression, **not** a new client writing result.
The old assisted campus manuscript and Chinese proposal were reused. The proposal
fixture required blank lines between existing references and a numbered caption
for its existing table; this operator preparation is not an unattended success.

- English: four Word proof pages and four PDF pages inspected; real italics,
  heading hierarchy, link spacing and separate references preserved.
- Chinese: five Word proof pages and five PDF pages inspected. CJK closing marks
  and punctuation clusters exposed a ReportLab line-breaking defect; the local
  paragraph subclass now selects legal boundaries without rewriting the text or
  altering the global ReportLab splitter. Latin and rich-text checks also pass. Repeated pagination and alternating-width reflow preserve exact characters and links without injecting spaces.
- Default external LibreOffice font discovery failed, producing missing glyphs.
  An explicit scratch Fontconfig configuration with the selected system fonts
  produced a five-page proof embedding Songti SC and Times New Roman. The built-in
  Word gate's Noto font registration remains the normal skill path; a different
  selected font needs actual renderer discovery and proof validation.
- Chinese PDF gate: zero errors, one final-page blank-space warning (37%). Every
  page was inspected; this is a natural ending with substantive text/references.
  The warning is retained, not suppressed or reported as a strict automatic pass.

Full local hash-bound record: `/private/tmp/mobius-writing-export-qa/export-validation.json`.
These fixtures verify export mechanics, not the scholarship of the old drafts.
Live acceptance on the built client remains separate.
