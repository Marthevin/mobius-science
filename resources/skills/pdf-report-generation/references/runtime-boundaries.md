# Managed Skill and Notebook runtime boundaries

OpenCode's native file tools and a Notebook kernel are separate execution domains. A native Read may be allowed to inspect a materialized Skill resource even when Python, `%run`, `subprocess`, `importlib`, Shell, or Notebook `open()` cannot access that same external path. The reverse can also occur: the Notebook can write its session data directory while native Edit or Write cannot. A permission error at this boundary does not mean that the Skill was packaged incorrectly.

## Use resources across the boundary

1. Use native Read to inspect the managed reference, script, or template. Treat the materialized package as read-only.
2. Decide whether the Notebook needs the exact file or an adaptation. References are instructions to read; they normally do not need to be copied or executed.
3. For executable code, create the adapted source in the Notebook's session data directory from a checked Notebook cell. Make the complete local source visible and rerunnable before the first report build.
4. When exact transfer matters, compare the source length and SHA-256 expected from the transferred content with the session-local file. Compile or import the local copy before using it. Record the local path and hash in the QA note.
5. Execute only the session-local source. Keep generated documents, figures, result tables, and QA artifacts in the session workspace.

Do not try the materialized Skill path repeatedly through different Notebook execution mechanisms after the boundary has been established. Do not weaken path controls, modify the managed package, or use native Edit or Write as a bridge into a directory outside its sandbox. If an exact transfer cannot be verified, adapt only the required behavior in a complete local file, test that behavior, and describe it as an adaptation rather than an identical copy.

If a required validator or style pass could not be loaded, do not write a simplified lookalike and report that the original check passed. Either transfer and verify the exact source as above, run an explicitly named independent check, or mark that validation unavailable in the QA record. A replacement with fewer rules cannot inherit the original tool's name or result.

## Preserve provenance

Record four identities separately:

- the managed Skill name and resource path that was read;
- the session-local source path that was executed;
- the source hash or an explicit note that it was adapted; and
- the final document hash checked by the relevant quality gate.

This record distinguishes the instructions consulted from the code actually executed and binds the QA evidence to the delivered report revision.
