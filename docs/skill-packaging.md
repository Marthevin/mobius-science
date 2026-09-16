# Skill packages and supporting files

A Skill is a directory, not just a Markdown document. Keep the entry point small and link to
supporting files at the point where the agent needs them:

```text
my-research-report/
  SKILL.md
  references/
    evidence-rules.md
    layout-checks.md
  scripts/
    check-report.py
```

`SKILL.md` needs YAML frontmatter with a lowercase hyphenated `name` and a `description` that
says when to use it. Using the same name for the source directory makes the package easier to
recognize; Open Science assigns its own managed directory on import. For example:

```markdown
---
name: my-research-report
description: Use when turning verified research results into a scientific PDF.
---

# Research report

Read [evidence rules](references/evidence-rules.md) before drafting claims. Read
[layout checks](references/layout-checks.md) before exporting the PDF.
```

To import the whole package from your computer, archive the directory and upload the `.zip` or
`.skill` in **Settings → Skills → Upload**. The preview lists the included files before import.
Uploading only `SKILL.md` creates a one-file Skill, so its relative links cannot bring along the
`references/` directory. When creating or editing a personal Skill in the form, **Advanced
settings → References** can also add individual supporting files; Open Science stores them under
the package's `references/` directory. Use an archive when you need nested paths or separate
`scripts/` and `assets/` directories. The built-in Skills use `resources/skills/<name>/` and are listed in
`resources/skills/manifest.json`; the app copies their entire directory into its managed agent home.

The agent loads `SKILL.md` when it selects the Skill for a turn, and reads linked references only
when the workflow calls for them. A new agent session receives a fresh instruction context, even
when the on-disk Skill package has not changed. The materializer tracks package versions and skips
copying unchanged files; a repeated instruction load is not necessarily a repeated installation.

For OpenCode, the materialized path is under
`~/.open-science/opencode/config/opencode/skills/os-<name>/`. Older Open Science releases denied
all OpenCode `external_directory` access, which also blocked native `Read` of references there.
The scoped rule in `src/main/agent-framework/opencode.ts` permits native reads recursively within
that managed Skills subtree and still denies writes to it and access to adjacent config, auth, and
instruction files. In any release, the managed JavaScript composer can read an imported reference
with `host.skills.read(name, 'references/evidence-rules.md')`. Executing a script remains subject to
the Notebook's execution permissions; the Skill read rule does not enable native Shell. Read the
script, then run its adapted contents as a checked Notebook cell or have that cell write a
session-local copy. Native Edit/Write may be unable to create that copy inside the Notebook data
directory because the file-tool sandbox and Notebook kernel have different roots. The Notebook also
cannot execute or open the materialized Skill path through `subprocess`, `%run`, or `importlib`;
copy the contents that OpenCode already read. Do not make the managed Skills directory writable
merely to execute a helper.
