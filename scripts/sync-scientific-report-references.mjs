import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2] ?? '--check'
if (!['--check', '--write'].includes(mode)) {
  throw new Error('Usage: node scripts/sync-scientific-report-references.mjs [--check|--write]')
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'skills')
const names = [
  'research-integrity.md',
  'report-architecture.md',
  'english-scientific-writing.md',
  'chinese-literature-review.md',
  'runtime-boundaries.md',
  'manuscript-export.md'
]
const destinations = ['pdf-report-generation', 'docx-generation']
const drift = []

for (const name of names) {
  const source = await readFile(join(root, '_shared', 'scientific-report', name))
  for (const skill of destinations) {
    const target = join(root, skill, 'references', name)
    if (mode === '--write') {
      await writeFile(target, source)
    } else {
      const current = await readFile(target)
      if (!source.equals(current)) drift.push(`${skill}/references/${name}`)
    }
  }
}

// The prose exporter is shared code, but each published Skill is self-contained.
const exporter = await readFile(join(root, '_shared/scientific-report/build_manuscript.py'))
for (const skill of destinations) {
  const target = join(root, skill, 'scripts/build_manuscript.py')
  if (mode === '--write') await writeFile(target, exporter)
  else if (!exporter.equals(await readFile(target)))
    drift.push(`${skill}/scripts/build_manuscript.py`)
}

if (drift.length) {
  console.error(`Scientific report references differ from _shared:\n${drift.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(
    mode === '--write'
      ? 'Scientific report references updated.'
      : 'Scientific report references match.'
  )
}
