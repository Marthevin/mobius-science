/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const manifestPath = resolve(root, 'mobius/upstream-touchpoints.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const declared = new Set(manifest.productionFiles.map((entry) => entry.path))

const downstreamPackagingSeams = new Set([
  'build/adhoc-sign.cjs',
  'packages/credential-identity-probe-native/src/credential_identity_probe.cc'
])

const gitLines = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const changed = new Set([
  ...gitLines('diff', '--name-only', '--diff-filter=ACMR', manifest.comparisonBase, '--'),
  ...gitLines('ls-files', '--others', '--exclude-standard')
])

const isUpstreamProductionFile = (path) => {
  if (path.startsWith('mobius/') || path.startsWith('src/mobius/')) return false
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) return false
  if (path === 'AGENTS.md' || path.startsWith('docs/') || path.startsWith('output/')) return false
  if (
    ['package.json', 'package-lock.json', 'tsconfig.node.json', 'tsconfig.web.json'].includes(path)
  ) {
    return true
  }
  if (path === 'scripts/stage-default-envs.mjs') return true
  if (downstreamPackagingSeams.has(path)) return true
  return path.startsWith('src/')
}

const undeclared = [...changed]
  .filter(isUpstreamProductionFile)
  .filter((path) => !declared.has(path))
const missing = [...declared].filter((path) => !existsSync(resolve(root, path)))

if (undeclared.length || missing.length) {
  if (undeclared.length) {
    console.error('Undeclared upstream production touchpoints:')
    for (const path of undeclared.sort()) console.error(`- ${path}`)
  }
  if (missing.length) {
    console.error('Touchpoint manifest entries missing from the repository:')
    for (const path of missing.sort()) console.error(`- ${path}`)
  }
  process.exitCode = 1
} else {
  console.log(`Mobius upstream touchpoint guard passed (${declared.size} declared seams).`)
}
