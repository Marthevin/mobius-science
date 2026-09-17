# Managed runtime staging

`npm run stage:mobius:runtimes` creates the platform-specific OpenCode binary and the verified
Python/R environment archives beneath this directory. The generated files are release inputs and
are intentionally excluded from Git; version pins and staging logic live in `mobius/config` and
`mobius/scripts`.
