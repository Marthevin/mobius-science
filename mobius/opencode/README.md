# Managed OpenCode source patch

Mobius retains OpenCode `--pure` and the application's permission/network model.
The official pinned webfetch timed only the request/headers, then consumed the
body outside that deadline. This patch puts retries, headers and body consumption
inside one scoped deadline, after permission approval. Early PDF rejection closes
the response and directs scholarly PDF acquisition to the Library; it does not
claim that download means verified full-text evidence.

`source-pin.json` pins the official source archive, pre/post-patch tool, Bun and
full models.dev snapshot. `models-api.json.gz` is a deterministic compressed copy
of the public models catalog, not a test fixture. The builder runs the original
webfetch tests and the local real-HTTP regression suite before compiling. The
regression source uses a `.txt` suffix in this repository: it runs in the pinned
OpenCode/Bun test tree, not this application's Vitest/TypeScript project. Only the
managed ACP binary is shipped; embedded OpenCode web UI is omitted. Its reported
upstream version remains 1.18.31; the manifest's `sourceBuild` identifies the fork
patch and regression hashes. The upstream MIT license is included beside it.

`npm run release:mobius:mac` builds native arm64/x64 from committed source. The
managed source builder also supports native Linux; Windows/cross compilation
currently fail explicitly. Never use a fixture models snapshot, enable external
plugins, patch binary strings, or replace a manifest to bypass verification.

On upgrades: inspect upstream source, retire the patch if fixed, or rebase the
small source patch; update pins, run failure/pass regression, compile, then pass
the normal DMG gates and live client acceptance. Cache identity includes source
pins, patch, tests, builder and models snapshot, so stale official binaries cannot
pass merely because `--version` matches. Source integrity/provenance is not a
claim of bit-for-bit reproducible native builds or an independent security audit.
