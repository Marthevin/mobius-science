# PDF webfetch incident and recovery — 2026-09-26

Observed during the live English Banwei essay test in Mobius Science 0.33.3,
DeepSeek Flash with managed OpenCode 1.18.31. This is a client acquisition test,
not a scholarly-quality benchmark or proof that every network path is reliable.

## Failure evidence

- Public source: https://pdf.hanspub.org/ml_2915237.pdf, DOI 10.12677/ml.2025.138800.
- Native `webfetch` with format `text` was created at 14:25:50.317 UTC and
  completed at 14:31:34.167 UTC (343.850 seconds, including any permission wait).
- The stored tool result and expanded client tool card began with `%PDF-1.5`,
  PDF objects and replacement-character garbage. The successful tool status did
  not mean readable full text and did not publish a downloadable PDF attachment.
- A separate bounded local curl probe returned HTTP 200, application/pdf,
  848546 bytes in 1.730 seconds. This rules out a permanently inaccessible URL;
  it does not reproduce the native tool's connection or identify its slow stage.
- The pinned upstream implementation decodes non-image data with TextDecoder
  rather than parsing PDF. Its request timeout wraps HTTP execution but not the
  subsequent response.arrayBuffer effect. Source:
  https://github.com/anomalyco/opencode/blob/v1.18.31/packages/opencode/src/tool/webfetch.ts
- Existing logs show permission-request receipt but no approval/body timing
  sufficient to attribute the entire observed delay. Do not claim the timeout
  omission alone explains all 343.850 seconds.

## Actual client recovery

1. Prompted the same session to retract the PDF full-text interpretation and use
   `acquire_pdf` with the DOI and original public HTTPS PDF URL.
2. Client tool completed in approximately eight seconds with `pending-review`.
   This is an Inbox receipt, not accepted Library state or extracted content.
3. Once the Library UI showed the accepted item and PDF attachment, opened it
   in the client: eight-page PDF, Chinese title and text rendered correctly.
4. Prompted `search_library` then focused `read_library_pdf`. The tool returned
   readable Chinese passages with PDF page numbers and document checksum
   `8024f8801a8815ae4c0648af246d36f52e360e95f58f31eea5aca5766f2037db`.
   Retrieval reported `fallback`; preserve that provenance, not a claim of
   semantic or comprehensive retrieval.
5. The agent updated its source record. Publication claims still require
   interpretation of the source and review of manuscript support.

## Skill changes and remaining runtime work

- Evidence guidance distinguishes completed fetch, acquired PDF, parsed passages
  and verified claims, with the supported product acquisition/reading route.
- The dependency-free writing audit rejects a decoded PDF masquerading as a
  UTF-8 source snapshot. A matching checksum and excerpt alone cannot pass it.
- Regression test failed before the fix; 17 audit tests passed afterward.
- This guidance and guard do not patch native OpenCode webfetch, guarantee tool
  selection, repair its whole-body timeout, or detect every malformed source.
  A runtime fix needs a separately tested integration strategy for the managed
  binary and no relaxation of the guarded download path's SSRF/TLS policy.
