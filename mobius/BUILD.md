# Mobius macOS release workflow

## One supported delivery command

```bash
npm run release:mobius:mac
```

`npm run build:mobius:mac` uses the same entry. Run it from the intended clean branch after committing
the code you want to deliver. It builds **committed HEAD**, records its full hash, and never rebases,
pulls, pushes, stashes, commits, or deletes changes for you. A modified or untracked source file blocks
the build. Ignored `dist/`, `output/`, runtime caches, and dependencies are not source inputs.

This version supports native macOS arm64 and x64. It refuses cross-architecture or other operating
systems because its mandatory startup test must execute the actual delivered binary. Windows/Linux
developer build entries are not certified by this workflow.

Prerequisites: Git, Node/npm compatible with this repository, Xcode Command Line Tools, network access
for npm and first-time runtime staging, and enough free space for an isolated npm installation and
the native application. The process uses the committed package lock via `npm ci`.

Optional output path (must not already exist):

```bash
npm run release:mobius:mac -- --output /private/tmp/mobius-release-candidate
```

By default output is `output/releases/<version>-<commit>-<timestamp>/`. Do not point it at a directory
containing files you want to keep. The command refuses to overwrite existing output.

## Mandatory phases

1. Check a clean source tree; record commit, branch, version and architecture.
2. Export only committed files using `git archive` into a new temporary directory.
3. Install exactly the lockfile dependencies with `npm ci`, including native build hooks.
4. Run Mobius build/brand/runtime regression tests and the upstream license-packaging contract.
5. Stage OpenCode, Python 3.12 and R 4.4. Verify platform, version, archive sizes and SHA-256.
6. Generate brand assets; run the complete typecheck and application build.
7. Package a DMG with the Mobius overlay and publishing disabled.
8. Inspect the **actual app.asar**. Reject old `dist/`, nested Apps/DMGs/ZIPs, local agent state,
   missing application entries, missing Skill references/scripts, and oversized output.
9. Verify the deep code signature, DMG integrity, and that the mounted DMG contains the same ASAR.
10. Launch the packaged application with an isolated test profile; create a project, restart and
    verify persistence. Test credentials use a mock keychain; the user's research profile is untouched.
11. Verify source HEAD has not changed; copy only the accepted DMG and write its SHA-256.
12. Mark the release manifest `ready` only after all mandatory phases pass.

Any failed phase leaves `status: failed` with the phase and log path. There are no skip-audit or
skip-smoke flags. Do not deliver a directory whose manifest says `running` or `failed`.

## Artifacts and storage

- `mobius-science-<version>-mac-<arch>.dmg`: accepted installer.
- `release-manifest.json`: provenance, exact runtime manifests, phase outcomes and timings.
- `bundle-audit.json`: application/ASAR bytes, largest embedded files and resource checks.
- `SHA256SUMS`: delivered installer checksum.
- `logs/`: per-phase output; a heartbeat prints the active log path every 30 seconds.
- `smoke/`: startup/persistence test evidence.
- `dmg-background.png`: installation design for visual review.

The source snapshot, its `node_modules`, and intermediate `.app` are deleted after normal completion
or a handled failure. The installed `/Applications/Mobius Science.app` is not overwritten. Forced
process termination can leave a `mobius-release-build-*` temporary directory; no such interrupted
run is marked ready.

Verified language/runtime cache files live under
`~/Library/Caches/MobiusScienceBuild/runtimes/<recipe-sha256>/`. The cache key includes target,
runtime staging sources, runtime version policy and product pins. Every reuse verifies all cached
file hashes again; an incomplete cache has no receipt and is not reused. Corruption stops the build
instead of silently using unknown bytes. Delete the affected build-cache directory to rebuild it.
Runtime receipts make the build traceable; upstream unpinned transitive conda solves and native
signing timestamps mean this is not a promise of byte-identical rebuilds.

## Size policy and the previous regression

`mobius/config/release-policy.json` sets explicit byte budgets (currently app 1.8 GB, ASAR 450 MB,
DMG 1.2 GB, decimal units). A deliberate dependency/runtime increase needs a reviewed policy change;
never raise a limit simply to hide unexplained growth. The full Python/R/OpenCode runtimes remain
bundled for offline first use.

The September 2026 oversized package embedded roughly 2.65 GiB of old releases. Moving the builder
output outside the repository stopped electron-builder from automatically excluding the old
`dist/` directory. The Mobius configuration now specifies positive package inputs, excludes staging
binaries, and tests the real builder filter with an external output directory. The independent
ASAR inspection catches regressions even if a future config change weakens that filter.

The packaging smoke test certifies startup, branding and persistence. It does **not** certify live
provider networking, full research workflows, scientific validity, or Apple notarization. Use the
separate end-to-end acceptance record for those claims. This entry does not request notarization;
current local signing remains suitable for local test distribution, not a notarized public release.
