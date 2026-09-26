# Shared scientific writing references

These five files are the editing source for prose, evidence, and runtime guidance shared by
`pdf-report-generation` and `docx-generation`. Each Skill carries its own byte-identical
copy under `references/` because OpenCode materializes Skills separately and may reject
external relative paths.

After editing a source file, run `node scripts/sync-scientific-report-references.mjs --write`.
The `--check` mode and `src/main/skills/registry.test.ts` catch drift.
