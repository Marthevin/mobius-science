# Managed Skill execution

If OpenCode marks a managed reference external, use `host.skills.read('research-proposal-writing', 'references/input-schema.md')` (or `scripts/proposal.py`) to obtain its content. This does not grant execution permission. When the Notebook kernel cannot execute the managed path, create a complete session-local source file and verify its SHA-256 and byte length before running it. Do not bypass a Notebook sandbox through `%run`, shell or subprocess. Keep the structured inputs and output source together so every revision is reproducible; record source identity and final document hash separately.

Use that API in the JavaScript control-plane REPL and write its returned UTF-8
`content` directly with `require('node:fs')` under a new directory in `process.cwd()`.
Compare the response bytes and local bytes with `require('node:crypto')`; do not
retype the displayed script or run a reduced imitation. Record `origin` and the
actual Skill ID. For prose proposals outside the statistical builder's supported
scope, use the document Skills' tested Markdown exporter and original validators;
do not fabricate a quantitative design just to satisfy an input schema.
