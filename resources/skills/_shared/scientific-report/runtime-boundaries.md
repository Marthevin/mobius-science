# Managed Skill and Notebook runtime boundaries

OpenCode's native file tools and a Notebook kernel are separate execution domains. A native Read may be allowed to inspect a materialized Skill resource even when Python, `%run`, `subprocess`, `importlib`, Shell, or Notebook `open()` cannot access that same external path. The reverse can also occur: the Notebook can write its session data directory while native Edit or Write cannot. A permission error at this boundary does not mean that the Skill was packaged incorrectly.

## Use resources across the boundary

1. Read the managed references; treat the package as read-only. References normally need no local executable copy.
2. In the JavaScript control-plane REPL, select the actual Skill ID with `host.skills.list()`. Read text resources with `await host.skills.read(id, 'scripts/build_manuscript.py')` (or the required template/validator path). Record `origin`; imported and built-in packages are different inputs.
3. Write `Buffer.from(result.content, 'utf8')` directly with `require('node:fs')` under a new directory created by `fs.mkdtempSync(require('node:path').join(process.cwd(), 'report-resources-'))`. Preserve package-relative `scripts/` and `assets/` paths so imports work. Do not manually reconstruct long code strings from displayed tool output. Use only explicit resource paths; no `..`, symlink destinations or overwriting user files.
4. Compare SHA-256 of the returned UTF-8 bytes and the local file using `require('node:crypto')`. When the package publishes `SHA256SUMS`, verify that as well. Record the path/hash and compile or import the complete copy. Text access is not a binary-font transport: do not UTF-8 round-trip a font or image. Use fonts already available in the runtime, an authorized binary attachment/download, or the supplied renderer's installed font support, then check glyphs.
5. Execute only session-local code from Notebook Python. Keep documents, figures, source tables and QA records in that session. Use the managed package installer for missing Python packages. Do not run subprocess pip or broaden filesystem/network permissions.

Do not try the materialized Skill path repeatedly through different Notebook execution mechanisms after the boundary has been established. Do not weaken path controls, modify the managed package, or use native Edit or Write as a bridge into a directory outside its sandbox. If an exact transfer cannot be verified, adapt only the required behavior in a complete local file, test that behavior, and describe it as an adaptation rather than an identical copy.

If a required validator or style pass could not be loaded, do not write a simplified lookalike and report that the original check passed. Either transfer and verify the exact source as above, run an explicitly named independent check, or mark that validation unavailable in the QA record. A replacement with fewer rules cannot inherit the original tool's name or result.

Check packages, fonts and renderers before the first build. Keep one frozen manuscript for all formats. Publish final files separately through the artifact API; archive nested source/QA directories into one ZIP instead of giving nested paths to a filename-only artifact field. Preserve actual artifact/version IDs returned by the tool. After compaction, reread the saved brief, source files and last QA result rather than restarting the build from memory.

## Preserve provenance

Record four identities separately:

- the managed Skill name and resource path that was read;
- the session-local source path that was executed;
- the source hash or an explicit note that it was adapted; and
- the final document hash checked by the relevant quality gate.

This record distinguishes the instructions consulted from the code actually executed and binds the QA evidence to the delivered report revision.
