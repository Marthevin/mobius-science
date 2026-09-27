# Product runtime and document handoff

The Skill's managed package is read-only. OpenCode native file access and the Notebook sandbox are separate. Read references through the supported Skill/native read tool. A native tool being able to read a file does not imply a Notebook kernel can execute that external path.

## Transfer exact resources without retyping

In the JavaScript **control-plane REPL**, use `host.skills.list()` to select the current Skill ID, then `host.skills.read(id, resourcePath)`. The built-in ID is `academic-writing`; an imported copy is a different package. Record `origin` so an imported test is never reported as built-in acceptance. If an editable draft shadows that ID, resolve it through the Skills UI rather than deleting user work.

Use the API response directly as data. Do not ask the model to reproduce the file from a tool output. The following cell transfers the standard-library audit script into a new directory under the REPL's session working directory and verifies the package checksum. Run the same transfer for document templates and validators, retaining their `scripts/` and `assets/` layout; hash the returned UTF-8 content and the written bytes. Read-only references do not need to be executed.

```javascript
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const id = 'academic-writing';
const script = await host.skills.read(id, 'scripts/audit_writing.py');
const sums = await host.skills.read(id, 'SHA256SUMS');
const expected = sums.content.trim().split(/\n/).map(l => l.trim().split(/\s+/))
  .find(row => row[1] === 'scripts/audit_writing.py')?.[0];
const bytes = Buffer.from(script.content, 'utf8');
if (!expected || digest(bytes) !== expected) throw new Error('Skill resource checksum mismatch');
const root = fs.mkdtempSync(path.join(process.cwd(), 'writing-resources-'));
fs.mkdirSync(path.join(root, 'scripts'));
const local = path.join(root, 'scripts/audit_writing.py');
fs.writeFileSync(local, bytes, { flag: 'wx' });
if (digest(fs.readFileSync(local)) !== expected) throw new Error('Local transfer mismatch');
console.log(JSON.stringify({ skill: id, origin: script.origin, root, local, sha256: expected }));
```

Use the returned session path from Notebook Python, never a guessed global skill path. A checksum detects copy drift, not publisher authenticity. If a resource needs adaptation, preserve the full adapted source, test its behavior and label it an adaptation. Do not substitute a shorter imitation of the audit. Install missing packages through the managed Notebook package installer; never subprocess `pip`, escape the sandbox, or repeatedly probe denied paths. This audit itself needs only Python's standard library.

## PDF sources

Use ordinary webfetch for readable web pages, not as a PDF text extractor. In Mobius Science, use the available Literature Library `acquire_pdf` tool with a verified DOI/PMID ref or bibliographic candidate and, when discovered, its public HTTPS `pdfUrl`. Respect network checks and access rights. This returns a download/Inbox receipt, not paper text. `pending-review` requires acceptance through the Library UI; do not represent it as an accepted item or invent an itemId. Preserve the checkpoint while that review is pending.

After acceptance, locate the item through `search_library` in the authorized scope and call `read_library_pdf` for focused passages with page numbers. For an explicitly attached PDF, use the supported attachment reading tools instead. Keep original PDF bytes separate from readable UTF-8 evidence snapshots used by `audit_writing.py`. Record extraction/OCR limits and inspect the page when layout affects interpretation. Downloaded, parsed, and scientifically verified are separate states. If the path is unavailable, keep the source unread and narrow or omit its dependent claim; do not bypass a denied network route.

A publisher wrapper or reference list can be selectable even when the article body is scanned. Inspect the consequential body pages, not only the successful extraction count. If available authorized OCR is needed, preserve page images, extracted text and page correspondence; check quotes against the image. Do not repeat webfetch on the same PDF after a PDF-routing error. A timed-out web page can be retried once with a justified alternate scholarly endpoint, then record the access limit and continue independent writing work.

## Authoritative content

Keep manuscript.md, source records, argument map and revision memo in the current session. Save exact final text and bibliography before export. Use one content source for DOCX/PDF; do not independently regenerate the two documents with different claims. A formatting fix should not silently change a result or thesis.

Invoke docx-generation for editable Word and pdf-report-generation for PDF. Pass genre, audience, target language, length convention, citation style and any venue template from the brief. Their scientific-report defaults are fallbacks: an essay needs no invented Methods/Results, mandatory structured abstract, minimum DOI count or artificial word floor. A book or archival reference can be valid without a DOI. A conceptual paper needs no decorative data figure.

For supported prose, use those Skills' `references/manuscript-export.md` and tested
`scripts/build_manuscript.py` with their matching template. This avoids custom
Markdown parsing, literal italic markers and merged bibliography entries. Complex
figures, equations or venue templates still use the format Skill's composition API.

Use Word heading styles, readable paragraph measure, appropriate spacing, hanging references, page numbers and embedded/available fonts. Check Chinese glyphs, diacritics, block quotes and long URLs. Keep figures/tables editable where appropriate; do not rasterize prose. Prefer quiet, consistent academic typography to covers and branding that consume short essays.

## Publish and recover

Keep nested source files under the session's working directory. For a multi-file handoff, create a ZIP with relative paths, then register it as one artifact using a plain filename; do not supply `sources/S1.txt` where an artifact API expects a filename. Publish final DOCX/PDF files separately. Reuse actual artifact IDs and versions returned by the product; do not invent a link from a filesystem path. Large prose belongs in files written by Notebook/REPL, not a shell command whose quotes or `&` can be misclassified as shell control syntax.

After compaction, load the brief, argument map, source ledger and revision memo. Check the current session/topic and unfinished tool status before continuing. A second parallel writing session is not this session's checkpoint. Record failed tools and the corrected route in the QA note so evaluation includes self-repairs as well as external prompts.

## Separate acceptance records

1. Content: final manuscript hash, source/claim review, what remains uncertain, real reviewer type.
2. DOCX/PDF structure: actual document-skill validator, its options and findings.
3. Visual: render the exact final file; inspect every page at readable scale. Record missing glyphs, overflow, orphan headings, table splits, sparse pages and corrected defects.
4. Product: confirm the client presents downloadable/openable artifacts. Record app version, model, session and steps. A file made externally is not evidence that the client created it.

If the renderer or source verification is unavailable, deliver the usable draft with that specific limitation. Do not label unrendered documents visually checked. Journal formatting is separate from scholarly readiness and final human author responsibility.
