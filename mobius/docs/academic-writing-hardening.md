# Academic writing: runtime and built-in delivery hardening

User-authorized scope, 2026-09-27. Continue `feat/academic-writing-quality`.
The three live writing sessions are development evidence, not gold standards.

## Outcome and boundaries

Deliver a packaged built-in academic-writing skill with fewer tool failures,
manual corrections, and preventable revision loops. Repair the managed OpenCode
webfetch whole-response deadline. Preserve pure-mode, permission brokering,
network isolation and TLS verification. Do not equate a prettier document,
self-score or small pilot with market leadership.

Language and source restrictions belong to the current brief. Chinese and media
sources are permitted when appropriate; their language, source type, provenance,
access level and evidential role must be reported accurately. English-only or
scholarly-only are optional task constraints, not product defaults.

## Baseline

Read-only session snapshots were retained outside version control. Banwei has
15 user turns and 27 failed tools; proposal 11/20; campus 8/9. A turn may be an
initial request, scheduled stage advance, new preference, correction, or mistaken
cross-session instruction. Classify them rather than treating all as identical.
Every correction, steer and self-repair remains a learning case.

Repeated failures: PDF bytes treated as text; scanned pages not read; denied
external paths retried; shell quoting/background detection; nested artifact names;
manual script copying; source metadata mistaken for support; adjacent constructs
confused; over-generalized examples; invented experience; conclusion stronger than
the argument; wrong genre; reused or stale audits; missing References heading;
literal Markdown; merged bibliography entries; inherited Word theme/grid;
unbalanced long titles and widows; incomplete DOCX visual QA.

## Design

1. **Runtime:** retain the pinned OpenCode source and a small downstream patch
   under `mobius/`. Build its managed binary from a checksum-pinned official
   archive. Put request, retry and response-body consumption under one deadline
   after permission. Keep cancellation and cleanup scoped. Reject PDF-as-text
   with actionable Library acquisition guidance. Test stalled headers, stalled
   body, slow chunks, fast success, cancellation and PDF detection. Bind the
   patch and tests into build-cache provenance and release audits. Do not enable
   external plugins just to intercept this tool. The packaged runtime is authoritative: verify its receipt and binary hash once per manager; missing or unusable bundled binaries fail clearly rather than falling back to old saved executables or PATH.
2. **Skill:** keep SKILL.md short; add reusable brief/source-policy and review
   recipes, observable stop/recovery rules and a worked synthetic example.
   Source scope follows claim coverage, not a fixed reference quota. Verify
   definitions/editions, units of inference, alternatives, first-person provenance
   and final conclusion against actual passages. Avoid turning the draft into a
   repetitive list of caveats or a transcript of tool problems.
3. **Execution:** use the existing supported `host.skills` API to copy exact
   resource bytes into the current session with identity/hash receipts; no
   broad filesystem grants. Use Notebook Python for document/data text, and
   explicit artifact publication for nested bundles. Preserve existing access
   controls and require pending-Inbox review through its normal workflow.
4. **Document handoff:** deterministic reuse of DOCX/PDF templates and validators;
   explicitly preserve genre, source policy and one frozen manuscript. Encode
   recurrent formatting requirements in assets/checks rather than long ad hoc
   prompts. Render every final page and bind reports to delivered hashes.
5. **Built-in:** manifest/registry/package assertions must cover SKILL.md,
   references, scripts and assets. Test a fresh profile without imported skills;
   in an upgraded profile identify the built-in stable ID explicitly and preserve
   any user's imported copy. An imported copy must not be mistaken for packaged
   acceptance. No silent deletion of imported content.

## Acceptance

- Regression tests demonstrate the old timeout failure before the patch and pass
  after; real HTTP body stall, not only a mocked fetch timer.
- Original source audit and document gates remain intact; new deterministic
  helpers have tests for actual output defects and boundary conditions.
- Required package files and checksums are checked in the actual application.
- One supported `release:mobius:mac` run produces a ready manifest and DMG.
- The exact built binary is opened and used for sequential live client tests:
  English critical essay, Chinese proposal, reflective campus essay, plus a
  held-out brief permitting Chinese/media sources with proper evidential roles.
- Fresh prompts specify task requirements only. External corrective prompts,
  source assistance and self-fixes are recorded, never hidden. Compare failure
  counts, intervention categories, unsupported claims, task compliance and all-page
  layout against the assisted baseline; no invented timing/token measurements.
- Broad competitive superiority remains unproven without an independent,
  representative blinded comparison. Report the achieved acceptance evidence.

## Work checklist

- [x] Preserve three baseline sessions and final campus artifacts.
- [x] Inspect pinned upstream webfetch and actual app isolation.
- [x] Reproduce and patch whole-response deadline; add build provenance.
- [x] Classify baseline interventions into reusable skill/runtime improvements.
- [x] Implement skill resources and deterministic export checks.
- [ ] Verify built-in registry, resource transfer and stale-import distinction.
- [x] Run affected unit tests, type/lint checks; commit build inputs locally.
- [ ] Run mandatory package/install/startup release gates.
- [ ] Build DMG through the supported release workflow.
- [ ] Run client acceptance, inspect final artifacts and report remaining defects.
