# Upstream rebase — 2026-10-16

Local `master` was rebased directly onto `upstream/main` at
`939712535` (fix(session): keep approval and input waits visible, #3574).
No remote branch was rewritten or pushed.

## Recovery points

- Local pre-rebase head: `backup/master-pre-rebase-20261016` (`6e7d5b7fc`).
- Observed remote head: `backup/origin-master-pre-rebase-20261016`.
- Untracked documents and output files were preserved. Brand images that temporarily
  blocked historical commits were copied back after rebase; an additional copy remains
  at `/private/tmp/mobius-rebase-untracked-20261016` for this machine.

## Compatibility work

Retained extracted package imports and host-owned policy injection. Reconnected the
Mobius offline provisioning policy and independently verified full-text destination
resolver at the new host composition boundaries. Preserved the new upstream startup
recovery and update lifecycle, including branded credential/profile selection.
Updated the disabled updater interface, test fixtures, orphaned translations and the
upstream touchpoint comparison baseline. The guard now also covers extracted package
production files.

## Verification

- `npm run build:packages`: passed after syncing local dependencies.
- `npm run typecheck:compiled`: passed (Node, sandbox and renderer).
- Targeted ESLint on compatibility edits: passed.
- Mobius touchpoint guard: passed, 114 declared seams.
- Targeted Vitest run: 42 files passed, 1270 tests passed, 2 skipped. Includes Mobius
  overlay/build scripts, report Skill resources, environment mutation/package manager,
  mirror fallback, full-text destination pinning, node entry, web bootstrap and i18n.
- `git diff --check`: passed.

### Startup test limitation

`src/main/index-startup-failure.test.ts` is not green: the downstream run had 9
failures. Replacing both the entry source and test file temporarily with the exact
`upstream/main` versions reproduced 8 failures out of 9 tests on this machine.
The downstream versions were restored immediately afterward. The upstream baseline
log is `/private/tmp/mobius-upstream-startup-baseline.log`; the downstream comparison
is `/private/tmp/mobius-rebase-tests2.log`. These results are not packaged application
acceptance, and this rebase does not certify a new release.
