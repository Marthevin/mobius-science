# Academic writing quality and client acceptance

Authorized 2026-09-26: research, implement a reusable academic-writing Skill, run the same three themes in the actual DeepSeek/OpenCode client, and compare quality. User expressly rejects the supplied essays as gold standards. A subsequent wrong-binary launch exposed a release acceptance gap; restore data and strengthen release gates first.

## Design decisions

- Keep implementation in resources/skills/academic-writing and downstream mobius documentation/scripts. Existing DOCX/PDF skills retain rendering ownership; academic-writing owns brief, genre, argument, evidence and revision.
- Nine separate anchored quality dimensions (research.md), no invented course marks, no aggregate score that cancels an integrity failure. Human expert review is required for broad competitive claims.
- Route critical/theoretical essays, reflective writing, historical commentary, literature synthesis, and empirical manuscripts explicitly. No mandatory IMRaD, DOI counts or word floors across genres.
- Persistent brief + source/claim ledger + draft + revision memo + final hash; progressive disclosure; scripts check structural integrity, never certify semantic truth.
- Research scope uses a bounded source plan and stop criteria. Books, editions, primary records and case material are supported. Inspect pivotal passages; metadata alone never becomes claim verification.
- Same-topic client runs first; controlled comparisons use the same frozen source packet, prompt, model and length budget. Separate acquisition variability and author/sample comparison. Retain run IDs and real outputs; do not label local surrogate runs as client E2E.

## Implementation and tests

1. Release acceptance: exact app path and ASAR fingerprint; real packaged legacy database upgrade and both-database conflict rejection, preserving files. Add brand asset provenance checks and a verified absolute-path launch helper. Never use or mutate real profile in automated release tests. Save today's manual real-profile restoration as a separate acceptance record.
2. Observe current workflow baseline before writing Skill. Capture over-retrieval, abstract-only support, genre mismatch, weak alternatives or export defects if present; also record successes.
3. Add SKILL.md and references: genre routing, argument/revision, evidence, EN/ZH style, quality rubric, runtime/exports. Implement dependency-free Python audit for cross-references, hashes, known missing/contradictory evidence and stale review receipts, with meaningful adversarial unit tests.
4. Add public synthetic fixtures and test prompts (three development themes plus held-out transfer tasks). Do not commit user essays or private profile data.
5. Install via supported product Skill import; verify references/scripts available through OpenCode and Notebook. Run stepwise live cases and export DOCX/PDF, render every final page, compare content with source packets.
6. Blind paired review with order reversal and source checks, retain disagreement/unassessable states, revise Skill on concrete failures, rerun affected cases. Deliver research, implemented Skill, actual artifacts and limitations.

## Review focus

Citation identity vs support; invented first-person experience; inaccurate cultural chronology; unsupported publication-ready claims; output language drift; stale audits after edits; user database isolation; launching an older same-name app; template forcing false research methods.

## User correction during live testing

The Yirang archaeological theme is a **research proposal**, not a completed
archaeological commentary. Reuse verified sources, preserve the commentary as
an intermediate artifact, and test the existing `research-proposal-writing`
Skill for the final proposal. Distinguish existing evidence, proposed methods,
access/permit dependencies, and fallback research. No named funding call or
institutional template was supplied; use an explicitly provisional internal
academic-review brief. Do not force the quantitative builder onto archaeological
work with no supported statistical design. Banwei and campus essays remain
`academic-writing` tests.
